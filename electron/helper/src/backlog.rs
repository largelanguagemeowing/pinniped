//! How far behind real time a captured source may fall (Windows share audio, see capture.rs).
//!
//! Each source buffers what its capture delivers until the mixer takes it, and the mixer takes
//! exactly the time that has passed. What a source still holds after a mix is how late its audio
//! goes out, and nothing brings that down again: audio that arrives late plays late from then on
//! (the mixer filled the gap with silence), audio held through a mixer stall is kept, and a device
//! clock running a little fast adds to it all the time. Left alone it grows to the source's cap
//! (a second) and drifts against the video and the other sources. So after each mix a source that
//! holds more than [`LIMIT_MS`] drops its oldest audio, down to [`TARGET_MS`].

#[cfg(test)]
mod tests;

/// What a source keeps after a trim. Captures deliver packets of about 10 ms and the mixer runs
/// every 20 ms, so a source that keeps up holds up to a tick or so after a mix; 40 ms (two ticks)
/// keeps that in hand, so the jitter right after a trim does not run the source dry (each time it
/// does, the mix gets a gap).
pub const TARGET_MS: usize = 40;
/// What a source may hold before it is trimmed. Well above what that jitter, plus a capture thread
/// woken late, leaves behind, so only a stall or clock drift trims. A clock 100 ppm fast gains the
/// 60 ms between the two in ten minutes, so it is trimmed about that rarely, and a source is never
/// more than about 100 ms late.
pub const LIMIT_MS: usize = 100;
/// How long the dropped audio fades out into the kept audio, so a trim does not click.
pub const FADE_MS: usize = 5;

/// The trimming policy at one sample rate, in frames.
#[derive(Clone, Copy, Debug)]
pub struct Backlog {
    target: usize,
    limit: usize,
    fade: usize,
}

impl Backlog {
    pub const fn at(rate: usize) -> Self {
        Self {
            target: rate * TARGET_MS / 1000,
            limit: rate * LIMIT_MS / 1000,
            fade: rate * FADE_MS / 1000,
        }
    }

    /// How many of its oldest frames a source holding `held` frames after a mix drops.
    pub fn excess(&self, held: usize) -> usize {
        if held > self.limit {
            held - self.target
        } else {
            0
        }
    }

    /// Trims the interleaved `samples` (`channels` per frame) a source holds after a mix, and
    /// returns how many frames it dropped.
    pub fn trim(&self, samples: &mut Vec<f32>, channels: usize) -> usize {
        let drop = self.excess(samples.len() / channels);
        if drop > 0 {
            drop_oldest(samples, channels, drop, self.fade);
        }
        drop
    }
}

/// Drops the oldest `drop` frames. The audio that would have come next fades out over the first
/// `fade` kept frames while they fade in, so the sound continues from what already went out
/// instead of jumping.
fn drop_oldest(samples: &mut Vec<f32>, channels: usize, drop: usize, fade: usize) {
    let frames = samples.len() / channels;
    let drop = drop.min(frames);
    let fade = fade.min(drop).min(frames - drop);
    for i in 0..fade {
        let kept = (i + 1) as f32 / (fade + 1) as f32;
        for c in 0..channels {
            let old = samples[i * channels + c];
            let new = &mut samples[(drop + i) * channels + c];
            *new = old * (1.0 - kept) + *new * kept;
        }
    }
    samples.drain(..drop * channels);
}
