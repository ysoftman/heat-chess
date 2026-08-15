declare module "*.svg" {
	const url: string;
	export default url;
}

// bun build --define 으로 빌드 시점에 주입된다 (dev 에서는 undefined)
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;
