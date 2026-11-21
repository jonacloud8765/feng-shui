{
  "targets": [
    {
      "target_name": "fengshui_native",
      "sources": ["fengshui_native.mm"],
      "xcode_settings": {
        "OTHER_CFLAGS": ["-fobjc-arc"],
        "MACOSX_DEPLOYMENT_TARGET": "12.0"
      },
      "link_settings": { "libraries": ["-framework AppKit", "-framework QuartzCore"] }
    }
  ]
}
