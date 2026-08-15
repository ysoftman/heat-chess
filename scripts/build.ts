import { execSync } from "node:child_process";

function git(cmd: string): string {
	try {
		return execSync(`git ${cmd}`, {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "";
	}
}

const version = git("describe --tags --abbrev=0") || "develop";
const commit = git("rev-parse --short HEAD") || "dev";
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
