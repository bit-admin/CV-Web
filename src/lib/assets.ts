export type RuntimeAsset = {
  url: string;
  path: string;
};

export const latexFontAssets: RuntimeAsset[] = [
  "Sabon/SabonLTStd-Regular.ttf",
  "Sabon/SabonLTStd-Bold.ttf",
  "Sabon/SabonLTStd-Italic.ttf",
  "Sabon/SabonLTStd-BoldItalic.ttf",
  "Calluna/Calluna-Regular.otf",
  "Cronos/CronosProLT-Regular.ttf",
  "Courier/CourierNew-Regular.ttf",
  "Fangsong/Fangsong.ttf",
  "Kaiti/Kaiti.ttf",
  "SimHei/SimHei.ttf",
  "Simsun/Simsun.ttc",
  "YuGothic/YuGothB.ttc",
  "YuGothic/YuGothM.ttc",
  "YuMincho/yumin.ttf",
  "YuMincho/yumindb.ttf",
  "YuMincho/yuminl.ttf"
].map((path) => ({
  path: `Fonts/${path}`,
  url: `/fonts/latex/${path}`
}));

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
  "/core/busytex/busytex.wasm",
  "/core/busytex/busytex_worker.js",
  "/core/busytex/chunks/manifest.json",
  "/core/busytex/texlive-basic.js",
  "/core/busytex/texlive-basic.data",
  "/core/busytex/texlive-basic.js.providespackage.txt",
  "/core/busytex/texlive-basic.profile",
  "/core/busytex/texlive-basic.txt",
  "/core/busytex/versions.txt"
];

export const criticalStaticAssets = [
  "/",
  ...busyTexAssets,
  ...supplementalTexliveAssets.map((asset) => asset.url),
  ...latexFontAssets.map((asset) => asset.url)
];
