fn main() {
    println!("cargo:rerun-if-changed=icons/");
    let build_time = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    println!("cargo:rustc-env=BUILD_TIME={}", build_time);
    tauri_build::build()
}
