// Small AppKit bridge for things Electron doesn't expose:
//   setCornerRadius - match the native blur's rounded mask to the widget's radius.
//   setDesktopLevel - put a window just above the desktop icons, below all
//                     app windows, while still receiving clicks.
//   appIcon         - an application's real icon as PNG (Electron's own
//                     icon API stops at 32px on macOS).
// Both take the Buffer from BrowserWindow.getNativeWindowHandle() (an NSView*).
#import <AppKit/AppKit.h>
#include <node_api.h>
#include <string>

static NSView* ViewFromBuffer(napi_env env, napi_value value) {
  void* data = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, value, &data, &length) != napi_ok || length < sizeof(void*)) return nil;
  return (__bridge NSView*)(*reinterpret_cast<void**>(data));
}

static void CollectEffectViews(NSView* view, NSMutableArray<NSVisualEffectView*>* out) {
  if ([view isKindOfClass:[NSVisualEffectView class]]) [out addObject:(NSVisualEffectView*)view];
  for (NSView* child in view.subviews) CollectEffectViews(child, out);
}

static NSImage* RoundedMask(CGFloat radius) {
  CGFloat side = radius * 2 + 1;
  NSImage* image = [NSImage imageWithSize:NSMakeSize(side, side) flipped:NO drawingHandler:^BOOL(NSRect rect) {
    [[NSColor blackColor] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:rect xRadius:radius yRadius:radius] fill];
    return YES;
  }];
  image.capInsets = NSEdgeInsetsMake(radius, radius, radius, radius);
  image.resizingMode = NSImageResizingModeStretch;
  return image;
}

static napi_value SetCornerRadius(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value result;
  napi_get_boolean(env, false, &result);
  if (argc < 2) return result;
  NSView* view = ViewFromBuffer(env, args[0]);
  double radius = 0;
  napi_get_value_double(env, args[1], &radius);
  NSWindow* window = view.window;
  if (!window) return result;
  NSMutableArray<NSVisualEffectView*>* effects = [NSMutableArray array];
  CollectEffectViews(window.contentView.superview ?: window.contentView, effects);
  NSImage* mask = radius > 0.5 ? RoundedMask(radius) : nil;
  for (NSVisualEffectView* effect in effects) effect.maskImage = mask;
  // Keep the window's own shadow in step with the new shape.
  [window invalidateShadow];
  napi_get_boolean(env, effects.count > 0, &result);
  return result;
}

static napi_value SetDesktopLevel(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value result;
  napi_get_boolean(env, false, &result);
  if (argc < 2) return result;
  NSView* view = ViewFromBuffer(env, args[0]);
  bool on = false;
  napi_get_value_bool(env, args[1], &on);
  NSWindow* window = view.window;
  if (!window) return result;
  if (on) {
    window.level = CGWindowLevelForKey(kCGDesktopIconWindowLevelKey) + 1;
    window.collectionBehavior |= NSWindowCollectionBehaviorStationary | NSWindowCollectionBehaviorIgnoresCycle;
  } else {
    window.level = NSNormalWindowLevel;
    window.collectionBehavior &= ~(NSWindowCollectionBehaviorStationary | NSWindowCollectionBehaviorIgnoresCycle);
  }
  napi_get_boolean(env, true, &result);
  return result;
}

// The app's real Finder icon as PNG data, rendered at `size` points @2x.
static napi_value AppIcon(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value result;
  napi_get_null(env, &result);
  if (argc < 2) return result;
  size_t len = 0;
  napi_get_value_string_utf8(env, args[0], nullptr, 0, &len);
  std::string path(len, '\0');
  napi_get_value_string_utf8(env, args[0], path.data(), len + 1, &len);
  double size = 64;
  napi_get_value_double(env, args[1], &size);
  @autoreleasepool {
    NSString* p = [NSString stringWithUTF8String:path.c_str()];
    if (![[NSFileManager defaultManager] fileExistsAtPath:p]) return result;
    NSImage* icon = [[NSWorkspace sharedWorkspace] iconForFile:p];
    NSInteger px = (NSInteger)(size * 2);
    NSBitmapImageRep* rep = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:px pixelsHigh:px
        bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:0 bitsPerPixel:0];
    rep.size = NSMakeSize(size, size);
    [NSGraphicsContext saveGraphicsState];
    NSGraphicsContext.currentContext = [NSGraphicsContext graphicsContextWithBitmapImageRep:rep];
    [icon drawInRect:NSMakeRect(0, 0, size, size) fromRect:NSZeroRect operation:NSCompositingOperationCopy fraction:1.0];
    [NSGraphicsContext restoreGraphicsState];
    NSData* png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    void* out = nullptr;
    napi_create_buffer_copy(env, png.length, png.bytes, &out, &result);
  }
  return result;
}

// Whether the left mouse button is held, so a drag can't get stuck if the
// release happens somewhere the widget never hears about.
static napi_value MouseDown(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_get_boolean(env, ([NSEvent pressedMouseButtons] & 1) != 0, &result);
  return result;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor props[] = {
    {"setCornerRadius", nullptr, SetCornerRadius, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setDesktopLevel", nullptr, SetDesktopLevel, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"appIcon", nullptr, AppIcon, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"mouseDown", nullptr, MouseDown, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 4, props);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
