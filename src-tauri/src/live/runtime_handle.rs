//! Bounded control plane for the single-owner live runtime.

use std::time::Duration;

use tokio::sync::{mpsc, oneshot};

use crate::live::bootstrap_snapshot::MonitorRuntimeSnapshot;
use crate::voice::models::VoiceRuntimeSnapshot;
const CONTROL_CAPACITY: usize = 64;
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug)]
pub enum RuntimeCommand {
    ManualReset,
    TogglePause,
    ApplyMonitorConfig(MonitorRuntimeSnapshot),
    /// Already normalized by the command handler; applying it cannot fail.
    ApplyVoiceConfig(VoiceRuntimeSnapshot),
    StartTraining,
    StopTraining,
    Shutdown {
        reply: oneshot::Sender<Result<(), String>>,
    },
}

#[derive(Clone, Debug)]
pub struct LiveRuntimeHandle {
    sender: mpsc::Sender<RuntimeCommand>,
}

impl LiveRuntimeHandle {
    pub fn new() -> (Self, mpsc::Receiver<RuntimeCommand>) {
        let (sender, receiver) = mpsc::channel(CONTROL_CAPACITY);
        (Self { sender }, receiver)
    }

    pub async fn manual_reset(&self) -> Result<(), String> {
        self.send(RuntimeCommand::ManualReset).await
    }

    pub async fn toggle_pause(&self) -> Result<(), String> {
        self.send(RuntimeCommand::TogglePause).await
    }

    pub async fn apply_monitor_config(
        &self,
        snapshot: MonitorRuntimeSnapshot,
    ) -> Result<(), String> {
        self.send(RuntimeCommand::ApplyMonitorConfig(snapshot))
            .await
    }

    pub async fn apply_voice_config(&self, snapshot: VoiceRuntimeSnapshot) -> Result<(), String> {
        self.send(RuntimeCommand::ApplyVoiceConfig(snapshot)).await
    }

    pub async fn start_training(&self) -> Result<(), String> {
        self.send(RuntimeCommand::StartTraining).await
    }

    pub async fn stop_training(&self) -> Result<(), String> {
        self.send(RuntimeCommand::StopTraining).await
    }

    /// Synchronous Tauri exit hook adapter. The runtime replies only after
    /// capture/decode drain, active-segment finalize, and the DB actor fence.
    pub fn shutdown_blocking(&self) -> Result<(), String> {
        let (reply, receive) = oneshot::channel();
        self.sender
            .blocking_send(RuntimeCommand::Shutdown { reply })
            .map_err(|_| "live runtime is unavailable".to_string())?;

        tauri::async_runtime::block_on(async move {
            tokio::time::timeout(SHUTDOWN_TIMEOUT, receive)
                .await
                .map_err(|_| "timed out stopping live runtime".to_string())?
                .map_err(|_| "live runtime stopped without replying".to_string())?
        })
    }

    async fn send(&self, command: RuntimeCommand) -> Result<(), String> {
        self.sender
            .send(command)
            .await
            .map_err(|_| "live runtime is unavailable".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn mutable_commands_use_the_bounded_control_channel() {
        let (handle, mut commands) = LiveRuntimeHandle::new();
        let task = tokio::spawn(async move {
            let Some(RuntimeCommand::ManualReset) = commands.recv().await else {
                panic!("unexpected command")
            };
        });

        handle.manual_reset().await.unwrap();
        task.await.unwrap();
    }
}
