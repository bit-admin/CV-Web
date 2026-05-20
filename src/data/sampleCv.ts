import type { CVData, CVLanguageCode } from "../lib/types";

export const sampleCv: CVData = {
  profile: {
    name: "Haruka Kobayashi",
    suffix: "Ph.D.",
    contacts: [
      { label: "(+1) 617-555-1948" },
      { label: "haruka.kobayashi@northbridge.edu" },
      { label: "https://linkedin.com/in/haruka-kobayashi" }
    ]
  },
  education: [
    {
      title: "Department of Statistics, University of Toronto",
      location: "Toronto, Canada",
      subtitle: "Ph.D. in Statistical Sciences",
      period: "2018 - 2023",
      bullets: [
        "Dissertation: _Robust Stochastic Control and Deep Hedging under Market Frictions_.",
        "Advisor: Prof. Michael R. Ellison; Committee: Prof. Laura Chen, Prof. David Stein, Prof. Keiko Watanabe.",
        "Research areas: Financial mathematics, stochastic control, quantitative risk management, machine learning for derivatives pricing."
      ]
    },
    {
      title: "Department of Mathematics, HKUST",
      location: "Hong Kong SAR",
      subtitle: "M.Sc. in Financial Mathematics",
      period: "2016 - 2018",
      bullets: [
        "Thesis: _Numerical Methods for High-Dimensional American Option Pricing_.",
        "GPA: 3.95/4.00; graduated with Distinction.",
        "Selected coursework: Stochastic Calculus, Interest Rate Models, Computational Finance, Convex Optimization, Risk Management."
      ]
    },
    {
      title: "Faculty of Science, Kyoto University",
      location: "Kyoto, Japan",
      subtitle: "B.Sc. in Mathematics",
      period: "2012 - 2016",
      bullets: [
        "Senior thesis: _Martingale Problems and Weak Convergence of Diffusion Processes_.",
        "GPA: 3.88/4.00; Departmental Honors.",
        "Ranked in top 3% of graduating class."
      ]
    }
  ],
  publications: [
    "**Haruka Kobayashi**, Michael R. Ellison. Robust Deep Hedging with Proportional Transaction Costs. _Mathematical Finance_, 2025.",
    "**Haruka Kobayashi**, Laura Chen, David Stein. Distributionally Robust Pricing of Path-Dependent Derivatives under Model Ambiguity. _SIAM Journal on Financial Mathematics_, 2024.",
    "**Haruka Kobayashi**, Keiko Watanabe. Neural Stochastic Control for Portfolio Optimization with Drawdown Constraints. _Annals of Applied Probability_, 2024.",
    "Yifan Zhou, **Haruka Kobayashi**, Michael R. Ellison. High-Dimensional Bermudan Option Pricing via Adaptive Regression Monte Carlo. _Quantitative Finance_, 2023.",
    "**Haruka Kobayashi**, Nathaniel Brooks. Wasserstein Ambiguity Sets for Counterparty Credit Risk. _Proceedings of the 2022 INFORMS Annual Meeting_, 2022.",
    "Mei Lin, **Haruka Kobayashi**, Anthony Lau. A Sparse Grid Approach to Multi-Asset American Options. _Asia-Pacific Financial Mathematics Conference_, 2018."
  ],
  workingPapers: [
    "**Haruka Kobayashi**, Elena Rossi. _Market Making with Inventory Risk under Latent Liquidity Regimes_. Under review.",
    "**Haruka Kobayashi**, Samuel Kim, Priya Raman. _Calibration of Rough Volatility Models using Physics-Informed Neural Networks_. Manuscript in preparation.",
    "**Haruka Kobayashi**. _Risk-Sensitive Reinforcement Learning for Dynamic Hedging under Execution Delays_. Manuscript in preparation."
  ],
  projects: [
    {
      title: "Robust Deep Hedging under Market Microstructure Noise",
      organization: "University of Toronto Quantitative Finance Lab",
      period: "2021.09 - 2023.08",
      bullets: [
        "Designed neural-network-based hedging strategies for incomplete markets with transaction costs, execution delays, and volatility uncertainty.",
        "Developed a simulation framework for comparing classical delta hedging, utility-based hedging, and deep reinforcement learning approaches.",
        "Reduced out-of-sample hedging shortfall by 18% relative to benchmark regression-based strategies in synthetic limit-order-book environments."
      ]
    },
    {
      title: "High-Dimensional Derivatives Pricing with Adaptive Monte Carlo",
      organization: "HKUST Financial Mathematics Research Group",
      period: "2017.01 - 2018.06",
      bullets: [
        "Implemented least-squares Monte Carlo and sparse-grid methods for pricing Bermudan basket options with up to 20 underlying assets.",
        "Introduced adaptive basis selection using LASSO regularization to improve stability under limited simulation budgets."
      ]
    },
    {
      title: "Martingale Methods for Diffusion Approximation",
      organization: "Kyoto University Undergraduate Research Program",
      period: "2015.04 - 2016.03",
      bullets: [
        "Studied weak convergence of Markov chains to diffusion limits using martingale problem formulations.",
        "Presented findings at the Kyoto Undergraduate Mathematics Colloquium."
      ]
    }
  ],
  experience: [
    {
      title: "Asteria Capital Management",
      location: "New York, USA",
      subtitle: "",
      period: "2023.09 - Present",
      bullets: [
        "Quantitative Researcher, Systematic Strategies Team.",
        "Develop factor models for equity index futures and cross-asset volatility strategies using statistical learning and stochastic filtering methods.",
        "Built production-grade Python libraries for volatility surface construction, scenario generation, and portfolio stress testing.",
        "Collaborated with traders and engineers to deploy intraday risk dashboards covering approximately USD 3.2B in notional exposure."
      ]
    },
    {
      title: "RBC Capital Markets",
      location: "Toronto, Canada",
      subtitle: "",
      period: "2021.05 - 2021.09",
      bullets: [
        "Quantitative Research Intern, Equity Derivatives Analytics.",
        "Improved calibration routines for local-stochastic volatility models using adjoint algorithmic differentiation.",
        "Benchmarked Monte Carlo Greeks against finite-difference PDE solvers for barrier and autocallable products."
      ]
    },
    {
      title: "Nomura Securities",
      location: "Tokyo, Japan",
      subtitle: "",
      period: "2019.06 - 2019.08",
      bullets: [
        "Summer Associate, Global Markets Quantitative Analytics.",
        "Implemented yield-curve bootstrapping and short-rate model calibration tools in Python and C++.",
        "Prepared internal research note on negative interest rate models for JPY fixed-income derivatives."
      ]
    },
    {
      title: "Hong Kong Monetary Analytics Lab",
      location: "Hong Kong SAR",
      subtitle: "",
      period: "2017.06 - 2017.12",
      bullets: [
        "Research Assistant in systemic risk and macro-financial stress testing.",
        "Constructed network models of interbank exposure using anonymized balance-sheet data.",
        "Applied principal component analysis and graphical models to identify contagion channels during liquidity shocks."
      ]
    }
  ],
  teaching: [
    {
      title: "University of Toronto",
      location: "Toronto, Canada",
      subtitle: "",
      period: "2019 - 2023",
      bullets: [
        "Teaching Assistant: Mathematical Finance, Stochastic Processes, Statistical Learning, Time Series Analysis.",
        "Designed problem sets on Itô's lemma, Black--Scholes PDEs, Girsanov theorem, and Monte Carlo variance reduction.",
        "Received departmental teaching evaluation score of 4.8/5.0 across six semesters."
      ]
    },
    {
      title: "HKUST",
      location: "Hong Kong SAR",
      subtitle: "",
      period: "2017 - 2018",
      bullets: [
        "Graduate Tutor: Computational Finance and Numerical Methods.",
        "Led weekly Python workshops on option pricing, portfolio optimization, and stochastic simulation."
      ]
    }
  ],
  awards: [
    { text: "Rising Star in Quantitative Finance, North American Quantitative Finance Association", date: "2025.03" },
    { text: "Best Dissertation Award, Department of Statistical Sciences, University of Toronto", date: "2023.06" },
    { text: "Alexander Graham Bell Canada Graduate Scholarship, NSERC", date: "2020 - 2023" },
    { text: "Women in Quantitative Finance Doctoral Fellowship, Global Quant Forum", date: "2021.09" },
    { text: "Best Student Paper, SIAM Conference on Fin. Mathematics and Engineering", date: "2021.06" },
    { text: "Graduate Research Excellence Award, University of Toronto", date: "2020.05" },
    { text: "Dean's List for Academic Excellence, HKUST", date: "2017.09" },
    { text: "MEXT Honors Scholarship for Privately Financed International Students", date: "2016.10" },
    { text: "Faculty of Science Undergraduate Research Prize, Kyoto University", date: "2016.03" },
    { text: "Gold Medal, Japan Mathematical Olympiad Final Round", date: "2011.02" }
  ],
  talks: [
    { text: "Robust Deep Hedging in Incomplete Markets, Columbia Financial Engineering Seminar", date: "2025.02" },
    { text: "Learning-Based Methods for Derivatives Pricing, MIT Operations Research Center Seminar", date: "2024.11" },
    { text: "Distributional Robustness in Quantitative Risk Management, University of Chicago Financial Mathematics Workshop", date: "2024.04" },
    { text: "Neural Stochastic Control with Market Frictions, SIAM Conference on Financial Mathematics and Engineering", date: "2023.07" },
    { text: "Sparse Regression Monte Carlo for Bermudan Basket Options, HKUST Quantitative Finance Colloquium", date: "2018.05" }
  ],
  skills: [
    {
      label: "Research",
      value:
        "Stochastic calculus, stochastic control, martingale methods, derivatives pricing, risk measures, portfolio optimization, market microstructure, robust optimization"
    },
    {
      label: "Programming",
      value: "",
      codeItems: ["Python", "C++", "R", "MATLAB", "Julia", "SQL"]
    },
    {
      label: "Libraries",
      value: "NumPy, SciPy, pandas, PyTorch, TensorFlow, JAX, scikit-learn, QuantLib, CVXPY, statsmodels"
    },
    {
      label: "Tools",
      value: "Git, Linux, Docker, Bloomberg Terminal, Refinitiv Eikon, LaTeX, Slurm, AWS EC2"
    },
    {
      label: "Languages",
      value: "Japanese native; English fluent; Mandarin conversational; Cantonese basic"
    }
  ],
  services: [
    {
      label: "Reviewer for",
      items: [
        "_Mathematical Finance_",
        "_SIAM Journal on Financial Mathematics_",
        "_Quantitative Finance_",
        "_Finance and Stochastics_",
        "_Operations Research_",
        "_NeurIPS Workshop on Machine Learning in Finance_"
      ]
    },
    { label: "Organizer", items: ["Junior Quantitative Finance Reading Group, University of Toronto"] },
    { label: "Mentor", items: ["Women in Mathematics Graduate Mentorship Program"] }
  ],
  coursework: [
    {
      label: "Mathematics",
      value: "Measure Theory, Functional Analysis, Probability Theory, Partial Differential Equations, Numerical Analysis, Convex Analysis"
    },
    {
      label: "Finance",
      value: "Derivatives Pricing, Fixed Income Models, Credit Risk, Market Risk, Algorithmic Trading, Portfolio Theory"
    },
    {
      label: "Statistics and Machine Learning",
      value: "Statistical Inference, Bayesian Methods, Time Series, Reinforcement Learning, Deep Learning, High-Dimensional Statistics"
    }
  ],
  references: "Available upon request."
};

export const sampleZhCv: CVData = {
  profile: {
    name: "小林春香",
    suffix: "Ph.D.",
    contacts: [
      { label: "(+1) 617-555-1948" },
      { label: "haruka.kobayashi@northbridge.edu" },
      { label: "https://linkedin.com/in/haruka-kobayashi" }
    ]
  },
  education: [
    {
      title: "多伦多大学统计科学系",
      location: "加拿大，多伦多",
      subtitle: "统计科学博士",
      period: "2018 - 2023",
      bullets: [
        "博士论文：《市场摩擦下的稳健随机控制与深度对冲》。",
        "导师：Michael R. Ellison 教授；答辩委员会：Laura Chen 教授、David Stein 教授、Keiko Watanabe 教授。",
        "研究方向：金融数学、随机控制、量化风险管理、机器学习在衍生品定价中的应用。"
      ]
    },
    {
      title: "香港科技大学数学系",
      location: "中国香港",
      subtitle: "金融数学理学硕士",
      period: "2016 - 2018",
      bullets: [
        "硕士论文：《高维美式期权定价的数值方法》。",
        "GPA：3.95/4.00；以优异成绩毕业。",
        "核心课程：随机微积分、利率模型、计算金融、凸优化、风险管理。"
      ]
    },
    {
      title: "京都大学理学院",
      location: "日本，京都",
      subtitle: "数学理学学士",
      period: "2012 - 2016",
      bullets: [
        "本科毕业论文：《鞅问题与扩散过程弱收敛》。",
        "GPA：3.88/4.00；获院系荣誉。",
        "毕业成绩位列本届前 3%。"
      ]
    }
  ],
  publications: sampleCv.publications,
  workingPapers: [
    "**Haruka Kobayashi**, Elena Rossi. _Market Making with Inventory Risk under Latent Liquidity Regimes_. 审稿中。",
    "**Haruka Kobayashi**, Samuel Kim, Priya Raman. _Calibration of Rough Volatility Models using Physics-Informed Neural Networks_. 手稿准备中。",
    "**Haruka Kobayashi**. _Risk-Sensitive Reinforcement Learning for Dynamic Hedging under Execution Delays_. 手稿准备中。"
  ],
  projects: [
    {
      title: "稳健深度对冲与市场微观结构噪声",
      organization: "多伦多大学量化金融实验室",
      period: "2021.09 - 2023.08",
      bullets: [
        "设计面向不完全市场的神经网络对冲策略，纳入交易成本、执行延迟与波动率不确定性。",
        "开发仿真框架，用于比较经典 Delta 对冲、效用型对冲与深度强化学习方法。",
        "在合成限价订单簿环境中，相比基准回归策略将样本外对冲短缺降低 18%。"
      ]
    },
    {
      title: "高维衍生品定价与自适应蒙特卡洛",
      organization: "香港科技大学金融数学研究组",
      period: "2017.01 - 2018.06",
      bullets: [
        "实现最小二乘蒙特卡洛与稀疏网格方法，为最多 20 个标的资产的百慕大篮子期权定价。",
        "引入基于 LASSO 正则化的自适应基函数选择，以提升有限模拟预算下的稳定性。"
      ]
    },
    {
      title: "扩散近似中的鞅方法",
      organization: "京都大学本科科研项目",
      period: "2015.04 - 2016.03",
      bullets: [
        "基于鞅问题框架研究马尔可夫链到扩散极限的弱收敛。",
        "在京都大学本科数学讨论班汇报研究成果。"
      ]
    }
  ],
  experience: [
    {
      title: "Asteria Capital Management",
      location: "美国，纽约",
      subtitle: "",
      period: "2023.09 - 至今",
      bullets: [
        "量化研究员，系统化策略团队。",
        "使用统计学习与随机滤波方法，开发股指期货和跨资产波动率策略的因子模型。",
        "构建生产级 Python 库，用于波动率曲面构建、情景生成与投资组合压力测试。",
        "与交易员和工程师协作部署日内风险看板，覆盖约 32 亿美元名义敞口。"
      ]
    },
    {
      title: "RBC Capital Markets",
      location: "加拿大，多伦多",
      subtitle: "",
      period: "2021.05 - 2021.09",
      bullets: [
        "量化研究实习生，股票衍生品分析团队。",
        "使用伴随算法自动微分改进局部随机波动率模型的校准流程。",
        "将蒙特卡洛希腊值与有限差分偏微分方程求解器在障碍期权和自动赎回产品上进行基准比较。"
      ]
    },
    {
      title: "野村证券",
      location: "日本，东京",
      subtitle: "",
      period: "2019.06 - 2019.08",
      bullets: [
        "暑期助理，全球市场量化分析团队。",
        "使用 Python 和 C++ 实现收益率曲线自举与短利率模型校准工具。",
        "撰写关于日元固定收益衍生品负利率模型的内部研究笔记。"
      ]
    },
    {
      title: "香港货币分析实验室",
      location: "中国香港",
      subtitle: "",
      period: "2017.06 - 2017.12",
      bullets: [
        "系统性风险与宏观金融压力测试方向研究助理。",
        "基于匿名资产负债表数据构建银行间风险敞口网络模型。",
        "应用主成分分析和图模型识别流动性冲击期间的传染渠道。"
      ]
    }
  ],
  teaching: [
    {
      title: "多伦多大学",
      location: "加拿大，多伦多",
      subtitle: "",
      period: "2019 - 2023",
      bullets: [
        "助教课程：金融数学、随机过程、统计学习、时间序列分析。",
        "设计关于 Itô 引理、Black--Scholes 偏微分方程、Girsanov 定理和蒙特卡洛方差缩减的习题。",
        "六个学期的院系教学评价平均分为 4.8/5.0。"
      ]
    },
    {
      title: "香港科技大学",
      location: "中国香港",
      subtitle: "",
      period: "2017 - 2018",
      bullets: [
        "研究生导师：计算金融与数值方法。",
        "组织每周 Python 工作坊，主题包括期权定价、投资组合优化和随机模拟。"
      ]
    }
  ],
  awards: [
    { text: "量化金融新星奖，北美量化金融协会", date: "2025.03" },
    { text: "最佳博士论文奖，多伦多大学统计科学系", date: "2023.06" },
    { text: "Alexander Graham Bell 加拿大研究生奖学金，NSERC", date: "2020 - 2023" },
    { text: "女性量化金融博士奖学金，全球量化论坛", date: "2021.09" },
    { text: "最佳学生论文奖，SIAM 金融数学与工程会议", date: "2021.06" },
    { text: "研究生科研卓越奖，多伦多大学", date: "2020.05" },
    { text: "学术优秀院长名单，香港科技大学", date: "2017.09" },
    { text: "文部科学省私费外国留学生学习奖励费", date: "2016.10" },
    { text: "理学院本科科研奖，京都大学", date: "2016.03" },
    { text: "金牌，日本数学奥林匹克决赛", date: "2011.02" }
  ],
  talks: [
    { text: "不完全市场中的稳健深度对冲，哥伦比亚大学金融工程研讨会", date: "2025.02" },
    { text: "衍生品定价的学习型方法，麻省理工学院运筹学研究中心研讨会", date: "2024.11" },
    { text: "量化风险管理中的分布稳健性，芝加哥大学金融数学工作坊", date: "2024.04" },
    { text: "带市场摩擦的神经随机控制，SIAM 金融数学与工程会议", date: "2023.07" },
    { text: "百慕大篮子期权的稀疏回归蒙特卡洛方法，香港科技大学量化金融讨论班", date: "2018.05" }
  ],
  skills: [
    {
      label: "研究",
      value: "随机微积分、随机控制、鞅方法、衍生品定价、风险度量、投资组合优化、市场微观结构、稳健优化"
    },
    {
      label: "编程",
      value: "",
      codeItems: ["Python", "C++", "R", "MATLAB", "Julia", "SQL"]
    },
    {
      label: "常用库",
      value: "NumPy, SciPy, pandas, PyTorch, TensorFlow, JAX, scikit-learn, QuantLib, CVXPY, statsmodels"
    },
    {
      label: "工具",
      value: "Git, Linux, Docker, Bloomberg Terminal, Refinitiv Eikon, LaTeX, Slurm, AWS EC2"
    },
    {
      label: "语言",
      value: "日语母语；英语流利；普通话可交流；粤语基础"
    }
  ],
  services: [
    {
      label: "审稿",
      items: [
        "_Mathematical Finance_",
        "_SIAM Journal on Financial Mathematics_",
        "_Quantitative Finance_",
        "_Finance and Stochastics_",
        "_Operations Research_",
        "_NeurIPS Workshop on Machine Learning in Finance_"
      ]
    },
    { label: "组织", items: ["多伦多大学青年量化金融读书会"] },
    { label: "导师", items: ["女性数学研究生导师项目"] }
  ],
  coursework: [
    {
      label: "数学",
      value: "测度论、泛函分析、概率论、偏微分方程、数值分析、凸分析"
    },
    {
      label: "金融",
      value: "衍生品定价、固定收益模型、信用风险、市场风险、算法交易、投资组合理论"
    },
    {
      label: "统计与机器学习",
      value: "统计推断、贝叶斯方法、时间序列、强化学习、深度学习、高维统计"
    }
  ],
  references: "可按要求提供。"
};

export const sampleJaCv: CVData = {
  profile: {
    name: "小林春香",
    suffix: "Ph.D.",
    contacts: [
      { label: "(+1) 617-555-1948" },
      { label: "haruka.kobayashi@northbridge.edu" },
      { label: "https://linkedin.com/in/haruka-kobayashi" }
    ]
  },
  education: [
    {
      title: "トロント大学 統計科学科",
      location: "カナダ，トロント",
      subtitle: "統計科学博士",
      period: "2018 - 2023",
      bullets: [
        "博士論文：『市場摩擦下におけるロバスト確率制御とディープヘッジング』。",
        "指導教員：Michael R. Ellison 教授；審査委員：Laura Chen 教授、David Stein 教授、Keiko Watanabe 教授。",
        "研究分野：金融数学、確率制御、定量的リスク管理、デリバティブ価格評価における機械学習。"
      ]
    },
    {
      title: "香港科技大学 数学科",
      location: "香港",
      subtitle: "金融数学修士",
      period: "2016 - 2018",
      bullets: [
        "修士論文：『高次元アメリカン・オプション価格評価のための数値手法』。",
        "GPA：3.95/4.00；優秀な成績で修了。",
        "主な履修科目：確率解析、金利モデル、計算金融、凸最適化、リスク管理。"
      ]
    },
    {
      title: "京都大学 理学部",
      location: "日本，京都",
      subtitle: "数学学士",
      period: "2012 - 2016",
      bullets: [
        "卒業論文：『マルチンゲール問題と拡散過程の弱収束』。",
        "GPA：3.88/4.00；学科優等。",
        "卒業時成績は同年度上位 3%。"
      ]
    }
  ],
  publications: sampleCv.publications,
  workingPapers: [
    "**Haruka Kobayashi**, Elena Rossi. _Market Making with Inventory Risk under Latent Liquidity Regimes_. 査読中。",
    "**Haruka Kobayashi**, Samuel Kim, Priya Raman. _Calibration of Rough Volatility Models using Physics-Informed Neural Networks_. 原稿準備中。",
    "**Haruka Kobayashi**. _Risk-Sensitive Reinforcement Learning for Dynamic Hedging under Execution Delays_. 原稿準備中。"
  ],
  projects: [
    {
      title: "市場マイクロストラクチャー・ノイズ下のロバスト・ディープヘッジング",
      organization: "トロント大学 定量金融研究室",
      period: "2021.09 - 2023.08",
      bullets: [
        "取引コスト、執行遅延、ボラティリティ不確実性を含む不完備市場に対し、ニューラルネットワークに基づくヘッジ戦略を設計。",
        "古典的デルタヘッジ、効用ベースのヘッジ、深層強化学習手法を比較するためのシミュレーション・フレームワークを開発。",
        "合成指値注文板環境において、基準となる回帰ベース戦略と比較してアウト・オブ・サンプルのヘッジ不足を 18% 削減。"
      ]
    },
    {
      title: "適応的モンテカルロ法による高次元デリバティブ価格評価",
      organization: "香港科技大学 金融数学研究グループ",
      period: "2017.01 - 2018.06",
      bullets: [
        "最大 20 資産のバミューダン・バスケット・オプションに対し、最小二乗モンテカルロ法と疎格子法を実装。",
        "限られたシミュレーション予算下で安定性を高めるため、LASSO 正則化による適応的基底選択を導入。"
      ]
    },
    {
      title: "拡散近似のためのマルチンゲール手法",
      organization: "京都大学 学部研究プログラム",
      period: "2015.04 - 2016.03",
      bullets: [
        "マルチンゲール問題の定式化に基づき、マルコフ連鎖から拡散極限への弱収束を研究。",
        "京都大学学部数学コロキウムにて研究成果を発表。"
      ]
    }
  ],
  experience: [
    {
      title: "Asteria Capital Management",
      location: "米国，ニューヨーク",
      subtitle: "",
      period: "2023.09 - 現在",
      bullets: [
        "量的研究員，システマティック戦略チーム。",
        "統計的学習と確率フィルタリングを用いて、株価指数先物およびクロスアセット・ボラティリティ戦略のファクターモデルを開発。",
        "ボラティリティ曲面構築、シナリオ生成、ポートフォリオ・ストレステストのための本番環境向け Python ライブラリを構築。",
        "トレーダーおよびエンジニアと協働し、約 32 億米ドルの想定元本エクスポージャーを対象とする日中リスク・ダッシュボードを導入。"
      ]
    },
    {
      title: "RBC Capital Markets",
      location: "カナダ，トロント",
      subtitle: "",
      period: "2021.05 - 2021.09",
      bullets: [
        "量的研究インターン，株式デリバティブ分析チーム。",
        "随伴アルゴリズム自動微分を用いて、局所確率ボラティリティモデルのキャリブレーション手順を改善。",
        "バリア商品および自動償還型商品について、モンテカルロ法によるグリークスを有限差分偏微分方程式ソルバーと比較検証。"
      ]
    },
    {
      title: "野村證券",
      location: "日本，東京",
      subtitle: "",
      period: "2019.06 - 2019.08",
      bullets: [
        "サマー・アソシエイト，グローバル市場量的分析チーム。",
        "Python と C++ により、イールドカーブのブートストラップと短期金利モデルのキャリブレーションツールを実装。",
        "円建て債券デリバティブにおける負金利モデルに関する社内調査ノートを作成。"
      ]
    },
    {
      title: "香港金融分析研究所",
      location: "香港",
      subtitle: "",
      period: "2017.06 - 2017.12",
      bullets: [
        "システミックリスクおよびマクロ金融ストレステストに関する研究助手。",
        "匿名化されたバランスシート・データを用いて、銀行間エクスポージャーのネットワークモデルを構築。",
        "主成分分析とグラフィカルモデルを適用し、流動性ショック時の伝播経路を特定。"
      ]
    }
  ],
  teaching: [
    {
      title: "トロント大学",
      location: "カナダ，トロント",
      subtitle: "",
      period: "2019 - 2023",
      bullets: [
        "ティーチング・アシスタント：金融数学、確率過程、統計的学習、時系列解析。",
        "Itô の補題、Black--Scholes 偏微分方程式、Girsanov の定理、モンテカルロ法の分散削減に関する問題セットを作成。",
        "6 学期を通じた学科授業評価は平均 4.8/5.0。"
      ]
    },
    {
      title: "香港科技大学",
      location: "香港",
      subtitle: "",
      period: "2017 - 2018",
      bullets: [
        "大学院チューター：計算金融、数値解析手法。",
        "オプション価格評価、ポートフォリオ最適化、確率シミュレーションに関する Python ワークショップを毎週実施。"
      ]
    }
  ],
  awards: [
    { text: "量的金融ライジングスター賞，北米定量金融協会", date: "2025.03" },
    { text: "最優秀博士論文賞，トロント大学 統計科学科", date: "2023.06" },
    { text: "Alexander Graham Bell カナダ大学院奨学金，NSERC", date: "2020 - 2023" },
    { text: "女性定量金融博士フェローシップ，グローバル定量フォーラム", date: "2021.09" },
    { text: "最優秀学生論文賞，SIAM 金融数学・工学会議", date: "2021.06" },
    { text: "大学院研究優秀賞，トロント大学", date: "2020.05" },
    { text: "学業優秀者名簿，香港科技大学", date: "2017.09" },
    { text: "文部科学省私費外国人留学生学習奨励費", date: "2016.10" },
    { text: "理学部学部研究賞，京都大学", date: "2016.03" },
    { text: "金メダル，日本数学オリンピック本選", date: "2011.02" }
  ],
  talks: [
    { text: "不完備市場におけるロバスト・ディープヘッジング，コロンビア大学金融工学セミナー", date: "2025.02" },
    { text: "デリバティブ価格評価のための学習ベース手法，MIT オペレーションズ・リサーチ・センター・セミナー", date: "2024.11" },
    { text: "定量的リスク管理における分布ロバスト性，シカゴ大学金融数学ワークショップ", date: "2024.04" },
    { text: "市場摩擦を伴うニューラル確率制御，SIAM 金融数学・工学会議", date: "2023.07" },
    { text: "バミューダン・バスケット・オプションのための疎回帰モンテカルロ法，香港科技大学定量金融コロキウム", date: "2018.05" }
  ],
  skills: [
    {
      label: "研究",
      value: "確率解析、確率制御、マルチンゲール手法、デリバティブ価格評価、リスク尺度、ポートフォリオ最適化、市場マイクロストラクチャー、ロバスト最適化"
    },
    {
      label: "プログラミング",
      value: "",
      codeItems: ["Python", "C++", "R", "MATLAB", "Julia", "SQL"]
    },
    {
      label: "ライブラリ",
      value: "NumPy, SciPy, pandas, PyTorch, TensorFlow, JAX, scikit-learn, QuantLib, CVXPY, statsmodels"
    },
    {
      label: "ツール",
      value: "Git, Linux, Docker, Bloomberg Terminal, Refinitiv Eikon, LaTeX, Slurm, AWS EC2"
    },
    {
      label: "言語",
      value: "日本語母語；英語流暢；中国語普通話 日常会話；広東語 基礎"
    }
  ],
  services: [
    {
      label: "査読",
      items: [
        "_Mathematical Finance_",
        "_SIAM Journal on Financial Mathematics_",
        "_Quantitative Finance_",
        "_Finance and Stochastics_",
        "_Operations Research_",
        "_NeurIPS Workshop on Machine Learning in Finance_"
      ]
    },
    { label: "運営", items: ["トロント大学若手定量金融読書会"] },
    { label: "メンター", items: ["女性数学大学院メンターシップ・プログラム"] }
  ],
  coursework: [
    {
      label: "数学",
      value: "測度論、関数解析、確率論、偏微分方程式、数値解析、凸解析"
    },
    {
      label: "金融",
      value: "デリバティブ価格評価、債券モデル、信用リスク、市場リスク、アルゴリズム取引、ポートフォリオ理論"
    },
    {
      label: "統計・機械学習",
      value: "統計的推論、ベイズ法、時系列解析、強化学習、深層学習、高次元統計"
    }
  ],
  references: "ご要望に応じて提示可能。"
};

export const sampleCvByLanguage: Record<CVLanguageCode, CVData> = {
  en: sampleCv,
  zh: sampleZhCv,
  ja: sampleJaCv
};
