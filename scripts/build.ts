import { $ } from "bun";

async function git(...args: string[]): Promise<string> {
	return (await $`git ${args}`.quiet().nothrow().text()).trim();
}

const version = (await git("describe", "--tags", "--abbrev=0")) || "develop";
const commit = (await git("rev-parse", "--short", "HEAD")) || "dev";
const time = new Date().toISOString();

const out = await Bun.build({
	entrypoints: ["./index.html"],
	outdir: "dist",
	minify: true,
	define: {
		__APP_VERSION__: JSON.stringify(version),
		__APP_COMMIT__: JSON.stringify(commit),
		__APP_BUILD_TIME__: JSON.stringify(time),
	},
});

if (!out.success) {
	console.error(out.logs);
	process.exit(1);
}
