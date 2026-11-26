// Embeds installer.manifest (visual styles, per-monitor DPI, long paths, asInvoker) into the
// installer with the linker alone, so no resource compiler is needed.
fn main() {
    println!("cargo:rerun-if-changed=installer.manifest");
    println!("cargo:rerun-if-changed=build.rs");
    let windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if windows_msvc {
        let dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        println!("cargo:rustc-link-arg-bin=pinniped-setup=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-bin=pinniped-setup=/MANIFESTINPUT:{dir}\\installer.manifest");
    }
}
