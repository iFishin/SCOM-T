fn main() {
    // macOS writes AppleDouble sidecars (`._*`) on exFAT/FAT volumes.
    // tauri-build scans the manifest directory for tauri.*.conf.json style
    // configs and parses them as UTF-8, so a `._tauri.macos.conf.json` makes
    // the build fail with an opaque "stream did not contain valid UTF-8".
    // Diagnose it clearly here; deliberately do NOT delete user files.
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".into());
    let mut sidecars: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&manifest_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("._") {
                sidecars.push(name.into_owned());
            }
        }
    }
    if !sidecars.is_empty() {
        sidecars.sort();
        println!(
            "cargo:warning=检测到 macOS AppleDouble 文件，会干扰 tauri-build 解析配置: {}",
            sidecars.join(", ")
        );
        println!(
            "cargo:warning=处理方式见 CONTRIBUTING.md（清理 ._* 或改用外置盘上的 APFS 稀疏镜像作为构建盘）"
        );
    }

    tauri_build::build()
}
