use super::*;

const RATE: usize = 48_000;
const POLICY: Backlog = Backlog::at(RATE);
const TARGET: usize = RATE * TARGET_MS / 1000;
const LIMIT: usize = RATE * LIMIT_MS / 1000;

fn frames(ms: f64) -> usize {
    (ms * RATE as f64 / 1000.0) as usize
}

/// xorshift64, so the runs are random-looking but the same every time.
struct Rng(u64);
impl Rng {
    fn below(&mut self, max_ms: f64) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 % 1_000_000) as f64 / 1_000_000.0 * max_ms
    }
}

/// How a source and the mixer behave, in the shape capture.rs has: the capture delivers 10 ms
/// packets on the device's clock, each read a little late by its thread; the mixer wakes every
/// 20 ms (plus scheduling delay), takes the time that passed (at most 200 ms, skipping the rest
/// after a stall), then trims what the source holds.
struct Scenario {
    seconds: f64,
    /// How much faster the device clock runs than the mixer's, in parts per million.
    drift_ppm: f64,
    /// The latest a packet is read after the device made it.
    max_read_delay_ms: f64,
    /// The latest the mixer wakes after its 20 ms.
    max_wake_delay_ms: f64,
    /// A mixer stall: at this second the mixer sleeps this much longer once.
    stall: Option<(f64, f64)>,
}

#[derive(Default, Debug)]
struct Outcome {
    /// Each trim: (when in seconds, frames dropped, frames left).
    trims: Vec<(f64, usize, usize)>,
    /// The most the source held after any mix and trim.
    max_held: usize,
    /// Ticks after which the source had nothing left (it ran dry, the mix may have had a gap),
    /// counted from the first trim on.
    dry_after_first_trim: usize,
}

fn run(s: Scenario) -> Outcome {
    const PACKET: usize = 480;
    let mut rng = Rng(0x9e37_79b9_7f4a_7c15);
    let packet_ms = 10.0 / (1.0 + s.drift_ppm / 1e6);
    let mut next_packet_made = packet_ms;
    let mut last_read = 0.0_f64;
    let mut pending_read: Option<f64> = None;

    let mut out = Outcome::default();
    let mut held = 0usize;
    let mut now = 0.0_f64;
    let mut emitted = 0usize;
    let mut stalled = false;
    while now < s.seconds * 1000.0 {
        now += 20.0 + rng.below(s.max_wake_delay_ms);
        if let Some((at, extra)) = s.stall {
            if !stalled && now >= at * 1000.0 {
                now += extra;
                stalled = true;
            }
        }
        // Everything the capture thread has read by now.
        loop {
            let read = *pending_read.get_or_insert_with(|| {
                last_read.max(next_packet_made + rng.below(s.max_read_delay_ms))
            });
            if read > now {
                break;
            }
            held += PACKET;
            last_read = read;
            next_packet_made += packet_ms;
            pending_read = None;
        }
        let due = frames(now);
        let chunk = (due - emitted).min(frames(200.0));
        emitted = due;
        held -= held.min(chunk);
        let dropped = POLICY.excess(held);
        held -= dropped;
        if dropped > 0 {
            out.trims.push((now / 1000.0, dropped, held));
        }
        if held == 0 && !out.trims.is_empty() {
            out.dry_after_first_trim += 1;
        }
        out.max_held = out.max_held.max(held);
    }
    out
}

const TEN_MINUTES: f64 = 600.0;

#[test]
fn jitter_alone_never_trims() {
    let out = run(Scenario {
        seconds: TEN_MINUTES,
        drift_ppm: 0.0,
        max_read_delay_ms: 15.0,
        max_wake_delay_ms: 3.0,
        stall: None,
    });
    assert!(out.trims.is_empty(), "{out:?}");
    assert!(out.max_held < LIMIT, "{out:?}");
}

#[test]
fn a_stall_trims_once_to_the_target() {
    let out = run(Scenario {
        seconds: 120.0,
        drift_ppm: 0.0,
        max_read_delay_ms: 15.0,
        max_wake_delay_ms: 3.0,
        stall: Some((60.0, 500.0)),
    });
    assert_eq!(out.trims.len(), 1, "{out:?}");
    let (at, dropped, left) = out.trims[0];
    assert!((60.0..60.6).contains(&at), "{out:?}");
    // 500 ms late, 200 ms of it went out with the next chunk.
    assert!(dropped > frames(250.0), "{out:?}");
    assert_eq!(left, TARGET);
    assert!(out.max_held <= LIMIT, "{out:?}");
    // What the target keeps in hand covers the jitter: the source never ran dry again.
    assert_eq!(out.dry_after_first_trim, 0, "{out:?}");
}

#[test]
fn a_fast_clock_is_trimmed_now_and_then_and_stays_bounded() {
    // 1000 ppm gains 60 ms (limit minus target) a minute.
    let out = run(Scenario {
        seconds: TEN_MINUTES,
        drift_ppm: 1000.0,
        max_read_delay_ms: 15.0,
        max_wake_delay_ms: 3.0,
        stall: None,
    });
    assert!((8..=11).contains(&out.trims.len()), "{out:?}");
    for &(_, dropped, left) in &out.trims {
        assert_eq!(left, TARGET);
        assert!(dropped > LIMIT - TARGET && dropped < LIMIT, "{out:?}");
    }
    assert!(out.max_held <= LIMIT, "{out:?}");
}

#[test]
fn only_more_than_the_limit_is_trimmed() {
    assert_eq!(POLICY.excess(0), 0);
    assert_eq!(POLICY.excess(LIMIT), 0);
    assert_eq!(POLICY.excess(LIMIT + 1), LIMIT + 1 - TARGET);
    assert_eq!(POLICY.excess(RATE), RATE - TARGET);
}

/// A 1 kHz tone, stereo (sine left, cosine right), from frame `from` on.
fn tone(from: usize, len: usize) -> Vec<f32> {
    (from..from + len)
        .flat_map(|i| {
            let phase = 2.0 * std::f32::consts::PI * 1000.0 * i as f32 / RATE as f32;
            [phase.sin(), phase.cos()]
        })
        .collect()
}

fn largest_step(samples: &[f32]) -> f32 {
    let left: Vec<f32> = samples.iter().step_by(2).copied().collect();
    let right: Vec<f32> = samples.iter().skip(1).step_by(2).copied().collect();
    [left, right]
        .iter()
        .flat_map(|ch| ch.windows(2).map(|w| (w[1] - w[0]).abs()))
        .fold(0.0, f32::max)
}

#[test]
fn a_trim_fades_into_the_kept_audio_without_a_jump() {
    let played = tone(0, 1000);
    // 85.5 periods are dropped, so cutting hard would flip the phase.
    let held_frames = 4104 + TARGET;
    let mut held = tone(1000, held_frames);
    let original = held.clone();
    assert_eq!(POLICY.trim(&mut held, 2), 4104);
    assert_eq!(held.len(), TARGET * 2);

    // The tone's own steps are about 0.13; a hard cut here jumps by about 1.7.
    let natural = largest_step(&tone(0, 100));
    let smooth: Vec<f32> = played.iter().chain(&held).copied().collect();
    assert!(
        largest_step(&smooth) <= natural + 0.02,
        "{} vs {natural}",
        largest_step(&smooth)
    );
    let fade = RATE * FADE_MS / 1000;
    let hard: Vec<f32> = played
        .iter()
        .chain(&original[4104 * 2..])
        .copied()
        .collect();
    assert!(
        largest_step(&hard) > 1.0,
        "the test cuts where it would click"
    );
    // Past the fade the kept audio is untouched.
    assert_eq!(&held[fade * 2..], &original[(4104 + fade) * 2..]);
}

#[test]
fn nothing_to_trim_leaves_the_samples_alone() {
    let mut held = tone(0, LIMIT);
    let original = held.clone();
    assert_eq!(POLICY.trim(&mut held, 2), 0);
    assert_eq!(held, original);
}
