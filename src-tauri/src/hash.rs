/// FNV-1a 64-bit hash — deterministic, no dependencies, fast.
/// Used for content deduplication across sessions.
/// Lives in its own module so clipboard capture and storage dedup
/// (upsert + inline update) can share it without a storage↔clipboard cycle.
pub fn fnv1a_64(data: &[u8]) -> i64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash as i64
}
