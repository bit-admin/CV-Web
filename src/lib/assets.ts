import type { CJKFontGroup } from "./latex";

export type RuntimeAsset = {
  url: string;
  path: string;
};

type FontAsset = RuntimeAsset & { group: CJKFontGroup | null };

/** Fonts written to `Fonts/` before each compile; CJK ones only when the CV needs them (see `cjkFontGroups`). */
const fontAssets: FontAsset[] = (
  [
    ["Sabon/SabonLTStd-Regular.ttf", null],
    ["Sabon/SabonLTStd-Bold.ttf", null],
    ["Sabon/SabonLTStd-Italic.ttf", null],
    ["Sabon/SabonLTStd-BoldItalic.ttf", null],
    ["Calluna/Calluna-Regular.otf", null],
    ["Cronos/CronosProLT-Regular.ttf", null],
    ["Courier/CourierNew-Regular.ttf", null],
    ["Fangsong/Fangsong.ttf", "zh"],
    ["Kaiti/Kaiti.ttf", "zh"],
    ["SimHei/SimHei.ttf", "zh"],
    ["Simsun/Simsun.ttc", "zh"],
    ["YuGothic/YuGothB.ttc", "ja"],
    ["YuGothic/YuGothM.ttc", "ja"],
    ["YuMincho/yumin.ttf", "ja"],
    ["YuMincho/yumindb.ttf", "ja"],
    ["YuMincho/yuminl.ttf", "ja"]
  ] as const
).map(([path, group]) => ({
  path: `Fonts/${path}`,
  url: `/fonts/latex/${path}`,
  group
}));

export function latexFontAssets(groups: Record<CJKFontGroup, boolean>): RuntimeAsset[] {
  return fontAssets.filter((asset) => asset.group === null || groups[asset.group]);
}

/** URLs of one language's CJK fonts. */
export function cjkFontUrls(group: CJKFontGroup): string[] {
  return fontAssets.filter((asset) => asset.group === group).map((asset) => asset.url);
}

/** What a runtime file belongs to, for download progress: a CJK font set, or the engine (everything else). */
export function runtimeAssetGroup(url: string): CJKFontGroup | "engine" {
  return fontAssets.find((asset) => asset.url === url)?.group ?? "engine";
}

export const supplementalTexliveAssets: RuntimeAsset[] = [
  "enumitem.sty",
  "ragged2e.sty",
  "setspace.sty",
  "tabularx.sty",
  "titlesec.sty",
  "ctex-c5size.clo",
  "ctex-cs4size.clo",
  "ctex-engine-aptex.def",
  "ctex-engine-luatex.def",
  "ctex-engine-pdftex.def",
  "ctex-engine-uptex.def",
  "ctex-engine-xetex.def",
  "ctex-fontset-adobe.def",
  "ctex-fontset-fandol.def",
  "ctex-fontset-founder.def",
  "ctex-fontset-mac.def",
  "ctex-fontset-macnew.def",
  "ctex-fontset-macold.def",
  "ctex-fontset-ubuntu.def",
  "ctex-fontset-windows.def",
  "ctex-heading-article.def",
  "ctex-heading-beamer.def",
  "ctex-heading-book.def",
  "ctex-heading-report.def",
  "ctex-name-gbk.cfg",
  "ctex-name-utf8.cfg",
  "ctex-scheme-chinese-article.def",
  "ctex-scheme-chinese-beamer.def",
  "ctex-scheme-chinese-book.def",
  "ctex-scheme-chinese-report.def",
  "ctex-scheme-chinese.def",
  "ctex-scheme-plain-article.def",
  "ctex-scheme-plain-beamer.def",
  "ctex-scheme-plain-book.def",
  "ctex-scheme-plain-report.def",
  "ctex-scheme-plain.def",
  "ctex.cfg",
  "ctex.sty",
  "ctexart.cls",
  "ctexbackend.cfg",
  "ctexbeamer.cls",
  "ctexbook.cls",
  "ctexcap.sty",
  "ctexheading.sty",
  "ctexhook.sty",
  "ctexopts.cfg",
  "ctexpatch.sty",
  "ctexrep.cls",
  "ctexsize.sty",
  "ctexspa.def",
  "fontspec.cfg",
  "fontspec-luatex.sty",
  "fontspec-xetex.sty",
  "fontspec.lua",
  "fontspec.sty",
  "svgnam.def",
  "x11nam.def",
  "xcolor-2022-06-12.sty",
  "xcolor.sty",
  "xeCJK-listings.sty",
  "xeCJK.cfg",
  "xeCJK.sty",
  "xeCJKfntef.sty",
  "xunicode-addon.sty",
  "zhnumber-big5.cfg",
  "zhnumber-gbk.cfg",
  "zhnumber-utf8.cfg",
  "zhnumber.sty"
].map((path) => ({
  path,
  url: `/core/texmf/${path}`
}));

export const busyTexAssets = [
  "/core/busytex/busytex.js",
  "/core/busytex/busytex_pipeline.js",
  "/core/busytex/busytex_biber.js",
  "/core/busytex/busytex.wasm",
  "/core/busytex/busytex_worker.js",
  "/core/busytex/texlive-basic.js",
  "/core/busytex/texlive-basic.data"
];

/** Everything a compile with these font groups needs, as URLs listed in the runtime manifest. */
export function runtimeAssetUrls(groups: Record<CJKFontGroup, boolean>): string[] {
  return [
    ...busyTexAssets,
    ...supplementalTexliveAssets.map((asset) => asset.url),
    ...latexFontAssets(groups).map((asset) => asset.url)
  ];
}
