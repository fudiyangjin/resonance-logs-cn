//! The single background task of a bptimer client, with cooperative
//! cancellation and a bounded wait on exit.

use std::future::Future;
use std::time::Duration;

use parking_lot::Mutex;
use tokio_util::sync::CancellationToken;

/// Upper bound on how long exit waits for a client to say goodbye.
const SHUTDOWN_GRACE: Duration = Duration::from_millis(800);

#[derive(Debug, Default)]
pub struct ClientTask {
    cancel: CancellationToken,
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl ClientTask {
    /// Cancelled by [`ClientTask::shutdown`].
    #[must_use]
    pub fn cancel_token(&self) -> CancellationToken {
        self.cancel.clone()
    }

    pub fn spawn(&self, task: impl Future<Output = ()> + Send + 'static) {
        *self.task.lock() = Some(tauri::async_runtime::spawn(task));
    }

    /// Cancels the task and waits briefly for it to close its connection.
    /// Safe to call more than once.
    pub fn shutdown(&self) {
        self.cancel.cancel();
        let Some(task) = self.task.lock().take() else {
            return;
        };
        // Build the timeout inside `block_on`: it registers its timer on
        // construction, and the exit hook runs outside any Tokio context.
        let _ = tauri::async_runtime::block_on(async move {
            tokio::time::timeout(SHUTDOWN_GRACE, task).await
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The Tauri exit hook calls `shutdown` outside any Tokio runtime context.
    #[test]
    fn shutdown_outside_runtime_context_waits_for_the_task() {
        let task = ClientTask::default();
        let cancel = task.cancel_token();
        task.spawn(async move {
            cancel.cancelled().await;
        });
        task.shutdown();
        assert!(task.task.lock().is_none());
        task.shutdown();
    }
}
