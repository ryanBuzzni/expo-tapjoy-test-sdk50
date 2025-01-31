"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_plugins_1 = require("@expo/config-plugins");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
// 중복되는 post_install 블록을 함수로 분리
function addPostInstallBlock(podfileContent) {
    const postInstallBlock = `
	post_install do |installer|
		installer.pods_project.targets.each do |target|
			target.build_configurations.each do |config|
				config.build_settings['EXCLUDED_ARCHS[sdk=iphonesimulator*]'] = 'arm64 x86_64'
				if ENV['RCT_NEW_ARCH_ENABLED'] == '1' then
					config.build_settings['OTHER_CPLUSPLUSFLAGS'] = '-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1 -Wno-comma -Wno-shorten-64-to-32 -DRCT_NEW_ARCH_ENABLED=1'
					config.build_settings['HEADER_SEARCH_PATHS'] = '$(PODS_ROOT)/boost'
					config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
				end
			end
			target.build_phases.each do |phase|
				if phase.respond_to?(:name) && phase.name == '[CP-User] Generate ExpoModulesProvider'
					phase.shell_script = 'echo "Generating ExpoModulesProvider.swift"'
				end
			end
		end
	`;
    const hasPostInstall = podfileContent.includes('post_install do |installer|');
    if (!hasPostInstall) {
        return podfileContent + postInstallBlock + '\nend';
    }
    if (hasPostInstall) {
        return podfileContent.replace(/post_install do \|installer\|/, postInstallBlock);
    }
    return podfileContent;
}
const withTapjoy = config => {
    // 프로젝트 레벨 build.gradle 수정
    config = (0, config_plugins_1.withProjectBuildGradle)(config, config => {
        const buildGradle = config.modResults.contents;
        if (!buildGradle.includes('https://sdk.tapjoy.com/')) {
            config.modResults.contents = buildGradle.replace(/(maven\s*{\s*url\s*'https:\/\/www\.jitpack\.io'\s*})/, `$1
        maven {
					name "Tapjoy's maven repo"
					url "https://sdk.tapjoy.com/"
        }`);
        }
        return config;
    });
    // Android 설정
    config = (0, config_plugins_1.withAppBuildGradle)(config, config => {
        const buildGradle = config.modResults.contents;
        // Tapjoy 의존성 추가
        if (!buildGradle.includes('com.tapjoy:tapjoy-android-sdk:14.2.1')) {
            config.modResults.contents = buildGradle.replace(/dependencies\s*{/, `dependencies {
    implementation 'com.tapjoy:tapjoy-android-sdk:14.2.1'
    implementation 'com.google.android.gms:play-services-ads-identifier:18.0.1'
    implementation 'org.jetbrains.kotlin:kotlin-stdlib:1.8.10'`);
        }
        return config;
    });
    // iOS 설정
    config = (0, config_plugins_1.withDangerousMod)(config, [
        'ios',
        async (config) => {
            const podfilePath = path_1.default.join(config.modRequest.platformProjectRoot, 'Podfile');
            let podfileContent = (0, fs_1.readFileSync)(podfilePath, 'utf-8');
            // TapjoySDK 추가
            if (!podfileContent.includes("pod 'TapjoySDK', '14.2.1'")) {
                podfileContent = podfileContent.replace(/target\s+'[^']+'\s+do/, `
target '${config.modRequest.projectName}' do
	pod 'TapjoySDK', '14.2.1'
					`);
            }
            // use_frameworks! 추가
            if (!podfileContent.includes('use_frameworks!')) {
                podfileContent = podfileContent.replace(/platform\s+:ios,\s*'[^']+'/, `platform :ios, '13.0'\nuse_frameworks!\nuse_modular_headers!`);
            }
            // New Architecture 추가
            if (!podfileContent.includes("ENV['RCT_NEW_ARCH_ENABLED']")) {
                podfileContent += `
	
	if ENV['RCT_NEW_ARCH_ENABLED'] == '1' then
		pod 'React-Codegen'
		pod 'RCT-Folly'
		pod 'RCTRequired'
		pod 'RCTTypeSafety'
		pod 'ReactCommon/turbomodule/core'
	end
				`;
            }
            // post_install 블록 추가
            podfileContent = addPostInstallBlock(podfileContent);
            (0, fs_1.writeFileSync)(podfilePath, podfileContent);
            return config;
        },
    ]);
    return config;
};
exports.default = (0, config_plugins_1.createRunOncePlugin)(withTapjoy, 'with-tapjoy', '1.0.0');
