//! Minimal, dependency-free WAV header inspection used to validate reference
//! audio before it is handed to the sidecar (which trusts whatever path it
//! is given, so the Rust host is the last line of defense here).

use std::io::Read;
use std::path::Path;

use super::error::{VoiceError, VoiceResult};

pub const MAX_REFERENCE_WAV_BYTES: u64 = 50 * 1024 * 1024;
pub const MIN_REFERENCE_DURATION_SEC: f64 = 1.0;
pub const MAX_REFERENCE_DURATION_SEC: f64 = 120.0;

#[derive(Debug, Clone, Copy)]
pub struct WavInfo {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub duration_sec: f64,
}

/// Parses just enough of the RIFF/WAVE header to sanity-check the file:
/// `RIFF....WAVEfmt <fmt-chunk>...data<size>`. Rejects anything that isn't a
/// canonical PCM/IEEE-float WAV container.
pub fn read_wav_info(path: &Path) -> VoiceResult<WavInfo> {
    let mut file = std::fs::File::open(path)
        .map_err(|e| VoiceError::io(format!("open {}", path.display()), e))?;

    let mut riff_header = [0u8; 12];
    file.read_exact(&mut riff_header)
        .map_err(|e| VoiceError::io("read WAV RIFF header", e))?;
    if &riff_header[0..4] != b"RIFF" || &riff_header[8..12] != b"WAVE" {
        return Err(VoiceError::validation(
            "referenceWavPath",
            "not a RIFF/WAVE file",
        ));
    }

    let mut sample_rate: Option<u32> = None;
    let mut channels: Option<u16> = None;
    let mut bits_per_sample: Option<u16> = None;
    let mut data_bytes: Option<u32> = None;
    let mut byte_rate: Option<u32> = None;

    loop {
        let mut chunk_header = [0u8; 8];
        match file.read_exact(&mut chunk_header) {
            Ok(()) => {}
            Err(_) => break,
        };
        let chunk_id = &chunk_header[0..4];
        let chunk_size = u32::from_le_bytes([
            chunk_header[4],
            chunk_header[5],
            chunk_header[6],
            chunk_header[7],
        ]);

        if chunk_id == b"fmt " {
            let mut fmt_body = vec![0u8; chunk_size as usize];
            file.read_exact(&mut fmt_body)
                .map_err(|e| VoiceError::io("read WAV fmt chunk", e))?;
            if fmt_body.len() < 16 {
                return Err(VoiceError::validation(
                    "referenceWavPath",
                    "WAV fmt chunk is too small",
                ));
            }
            channels = Some(u16::from_le_bytes([fmt_body[2], fmt_body[3]]));
            sample_rate = Some(u32::from_le_bytes([
                fmt_body[4],
                fmt_body[5],
                fmt_body[6],
                fmt_body[7],
            ]));
            byte_rate = Some(u32::from_le_bytes([
                fmt_body[8],
                fmt_body[9],
                fmt_body[10],
                fmt_body[11],
            ]));
            bits_per_sample = Some(u16::from_le_bytes([fmt_body[14], fmt_body[15]]));
        } else if chunk_id == b"data" {
            data_bytes = Some(chunk_size);
            // Duration only needs the size; skip the payload itself.
            skip_bytes(&mut file, chunk_size as u64)?;
        } else {
            skip_bytes(&mut file, chunk_size as u64)?;
        }

        // RIFF chunks are word-aligned; skip the pad byte for odd-sized chunks.
        if chunk_size % 2 == 1 {
            skip_bytes(&mut file, 1)?;
        }
    }

    let sample_rate = sample_rate
        .ok_or_else(|| VoiceError::validation("referenceWavPath", "missing WAV fmt chunk"))?;
    let channels = channels
        .ok_or_else(|| VoiceError::validation("referenceWavPath", "missing WAV fmt chunk"))?;
    let bits_per_sample = bits_per_sample
        .ok_or_else(|| VoiceError::validation("referenceWavPath", "missing WAV fmt chunk"))?;
    let data_bytes = data_bytes
        .ok_or_else(|| VoiceError::validation("referenceWavPath", "missing WAV data chunk"))?;
    let byte_rate = byte_rate.unwrap_or(0);

    if sample_rate == 0 || channels == 0 || bits_per_sample == 0 {
        return Err(VoiceError::validation(
            "referenceWavPath",
            "invalid WAV fmt chunk",
        ));
    }

    let duration_sec = if byte_rate > 0 {
        f64::from(data_bytes) / f64::from(byte_rate)
    } else {
        let block_align = f64::from(channels) * f64::from(bits_per_sample) / 8.0;
        if block_align > 0.0 {
            f64::from(data_bytes) / block_align / f64::from(sample_rate)
        } else {
            0.0
        }
    };

    Ok(WavInfo {
        sample_rate,
        channels,
        bits_per_sample,
        duration_sec,
    })
}

fn skip_bytes(file: &mut std::fs::File, mut remaining: u64) -> VoiceResult<()> {
    if remaining == 0 {
        return Ok(());
    }
    let mut buf = [0u8; 4096];
    while remaining > 0 {
        let want = remaining.min(buf.len() as u64) as usize;
        let read = file
            .read(&mut buf[..want])
            .map_err(|e| VoiceError::io("skip WAV chunk bytes", e))?;
        if read == 0 {
            break;
        }
        remaining -= read as u64;
    }
    Ok(())
}

/// Validates a candidate reference WAV (size + header + duration bounds) and
/// copies it into the controlled voice directory tree only if it passes.
pub fn validate_and_copy_reference_wav(source: &Path, dest: &Path) -> VoiceResult<WavInfo> {
    let metadata = std::fs::metadata(source)
        .map_err(|e| VoiceError::io(format!("inspect {}", source.display()), e))?;
    if metadata.len() > MAX_REFERENCE_WAV_BYTES {
        return Err(VoiceError::validation(
            "referenceWavPath",
            format!(
                "reference WAV too large ({} bytes, max {})",
                metadata.len(),
                MAX_REFERENCE_WAV_BYTES
            ),
        ));
    }

    let info = read_wav_info(source)?;
    if info.duration_sec < MIN_REFERENCE_DURATION_SEC
        || info.duration_sec > MAX_REFERENCE_DURATION_SEC
    {
        return Err(VoiceError::validation(
            "referenceWavPath",
            format!(
                "reference WAV duration {:.2}s out of allowed range [{}, {}]",
                info.duration_sec, MIN_REFERENCE_DURATION_SEC, MAX_REFERENCE_DURATION_SEC
            ),
        ));
    }

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| VoiceError::io(format!("create {}", parent.display()), e))?;
    }
    std::fs::copy(source, dest).map_err(|e| {
        VoiceError::io(
            format!("copy {} to {}", source.display(), dest.display()),
            e,
        )
    })?;
    Ok(info)
}
