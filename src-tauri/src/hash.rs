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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv1a_reference_vectors() {
        // Standard FNV-1a 64 test vectors
        assert_eq!(fnv1a_64(b""), 0xcbf29ce484222325u64 as i64);
        assert_eq!(fnv1a_64(b"a"), 0xaf63dc4c8601ec8cu64 as i64);
        assert_eq!(fnv1a_64(b"foobar"), 0x85944171f73967e8u64 as i64);
    }

    #[test]
    fn deterministic_per_input() {
        assert_eq!(fnv1a_64(b"same"), fnv1a_64(b"same"));
        assert_ne!(fnv1a_64(b"one"), fnv1a_64(b"two"));
    }
}
