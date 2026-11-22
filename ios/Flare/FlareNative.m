#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

/**
 * Small platform helpers Flare needs and no lean library covers:
 * battery state for the mesh SDK, and saving an image to a file the map can load.
 */
@interface FlareNative : NSObject <RCTBridgeModule>
@end

@implementation FlareNative

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

static BOOL FlareSafeName(NSString *name)
{
  NSRegularExpression *re = [NSRegularExpression regularExpressionWithPattern:@"^[A-Za-z0-9._-]{1,128}$"
                                                                      options:0
                                                                        error:nil];
  return name != nil && [re numberOfMatchesInString:name options:0 range:NSMakeRange(0, name.length)] == 1;
}

static NSURL *FlareDir(void)
{
  NSURL *base = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                                       inDomains:NSUserDomainMask].firstObject;
  NSURL *dir = [base URLByAppendingPathComponent:@"flare" isDirectory:YES];
  [[NSFileManager defaultManager] createDirectoryAtURL:dir withIntermediateDirectories:YES attributes:nil error:nil];
  return dir;
}

RCT_EXPORT_METHOD(getBattery : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    UIDevice *device = [UIDevice currentDevice];
    device.batteryMonitoringEnabled = YES;
    float level = device.batteryLevel; // -1 when unknown (simulator)
    UIDeviceBatteryState state = device.batteryState;
    resolve(@{
      @"level" : @(level < 0 ? -1 : level * 100.0),
      @"charging" : @(state == UIDeviceBatteryStateCharging || state == UIDeviceBatteryStateFull),
    });
  });
}

RCT_EXPORT_METHOD(writeFile : (NSString *)name base64 : (NSString *)base64 resolver : (RCTPromiseResolveBlock)
                      resolve rejecter : (RCTPromiseRejectBlock)reject)
{
  if (!FlareSafeName(name)) {
    reject(@"invalid_name", @"File name must be letters, digits, dot, dash or underscore.", nil);
    return;
  }
  NSData *data = [[NSData alloc] initWithBase64EncodedString:base64
                                                     options:NSDataBase64DecodingIgnoreUnknownCharacters];
  if (data == nil) {
    reject(@"invalid_data", @"Not valid base64.", nil);
    return;
  }
  NSURL *url = [FlareDir() URLByAppendingPathComponent:name];
  NSError *error = nil;
  if (![data writeToURL:url options:NSDataWritingAtomic error:&error]) {
    reject(@"write_failed", error.localizedDescription, error);
    return;
  }
  resolve(url.absoluteString);
}

RCT_EXPORT_METHOD(deleteFile : (NSString *)name resolver : (RCTPromiseResolveBlock)
                      resolve rejecter : (RCTPromiseRejectBlock)reject)
{
  if (!FlareSafeName(name)) {
    resolve(@NO);
    return;
  }
  NSURL *url = [FlareDir() URLByAppendingPathComponent:name];
  resolve(@([[NSFileManager defaultManager] removeItemAtURL:url error:nil]));
}

@end
