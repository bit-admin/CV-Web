// CV Forge: close the files each compile leaves open. Appended to busytex_pipeline.js by
// scripts/build-runtime-assets.mjs (and by scripts/busytex-node.mjs when it runs the vendor copy).
// xelatex and xdvipdfmx exit without closing their files, and with `preload` the module is reused for every
// compile, so each one leaks 80-330 streams until Emscripten's limit (4096) makes later compiles fail to open
// fonts ("not loadable", "found but I could not open").
(function () {
    const compile = BusytexPipeline.prototype.compile;
    if (compile.cvForgeClosesStreams) return;
    const openFds = (Module) => new Set(Module.FS.streams.flatMap((stream) => (stream ? [stream.fd] : [])));
    BusytexPipeline.prototype.compile = async function (...args) {
        const loaded = this.Module && (await this.Module.catch(() => null));
        const before = loaded ? openFds(loaded) : new Set([0, 1, 2]);
        try {
            return await compile.apply(this, args);
        } finally {
            const Module = this.Module && (await this.Module.catch(() => null));
            if (Module) {
                for (const stream of Module.FS.streams) {
                    if (stream && !before.has(stream.fd)) Module.FS.close(stream);
                }
            }
        }
    };
    BusytexPipeline.prototype.compile.cvForgeClosesStreams = true;
})();
