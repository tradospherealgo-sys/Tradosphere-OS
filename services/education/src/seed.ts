import type { Logger } from '@tradosphere/logger';
import type {
  CategoryRepository,
  TagRepository,
  GlossaryRepository,
  CourseRepository,
  LessonRepository,
  StrategyRepository,
  QuizRepository,
  QuizQuestionRepository,
  ContentTagRepository,
  ContentType,
} from './repository';

// Task 7.2 -- baseline educational content, written through the same
// repository layer (never raw SQL) that services/education's HTTP routes
// use, per Forge's charter rule 5 (reuse before rewrite). Every row below is
// existence-checked first -- getBySlug for glossary/course/strategy/quiz,
// list()+Map for categories/tags (which have no getBySlug), listByCourse's
// composite key for lessons, listByQuiz for questions, listForContent for
// tag attachments -- and skipped, never overwritten, if already present. That
// makes this function safe to run on every boot/deploy, the same idempotency
// guarantee runMigrations() gives (packages/database/src/migrate.ts), and
// matches Delta's charter rule 3 ("every import is idempotent, validates
// before insert, and logs row counts").
//
// The content itself is real, accurate baseline trading education
// (source_type defaults to 'human'). Delta's charter rule 5 ("data is never
// invented") governs fabricating market/financial data (prices, fundamentals,
// broker responses); authoring genuine educational copy is exactly what
// SPRINT_BOOK.md's task 7.2 asks for -- see Decision D11 in
// EXECUTION_BOOK.md for why this service is DB-backed CRUD content rather
// than static files.

export interface SeedDeps {
  categoryRepo: CategoryRepository;
  tagRepo: TagRepository;
  glossaryRepo: GlossaryRepository;
  courseRepo: CourseRepository;
  lessonRepo: LessonRepository;
  strategyRepo: StrategyRepository;
  quizRepo: QuizRepository;
  quizQuestionRepo: QuizQuestionRepository;
  contentTagRepo: ContentTagRepository;
  logger: Logger;
}

export interface SeedCounts {
  inserted: number;
  skipped: number;
}

const CATEGORIES = [
  {
    slug: 'technical-analysis',
    name: 'Technical Analysis',
    description: 'Chart patterns, indicators, and price-action based trading approaches.',
  },
  {
    slug: 'fundamental-analysis',
    name: 'Fundamental Analysis',
    description: "Evaluating a company's financial health and intrinsic value.",
  },
  {
    slug: 'options-trading',
    name: 'Options Trading',
    description: 'Options contracts, strategies, and risk profiles.',
  },
  {
    slug: 'risk-management',
    name: 'Risk Management',
    description: 'Position sizing, stop losses, and capital preservation techniques.',
  },
] as const;

const TAGS = [
  { slug: 'beginner', name: 'Beginner' },
  { slug: 'intermediate', name: 'Intermediate' },
  { slug: 'advanced', name: 'Advanced' },
  { slug: 'charting', name: 'Charting' },
  { slug: 'options', name: 'Options' },
  { slug: 'risk', name: 'Risk' },
] as const;

const GLOSSARY_TERMS = [
  {
    slug: 'relative-strength-index',
    term: 'Relative Strength Index (RSI)',
    definition:
      'A momentum oscillator that measures the speed and magnitude of recent price changes on a 0-100 scale, commonly used to flag overbought conditions above 70 and oversold conditions below 30.',
    categorySlug: 'technical-analysis',
    tags: ['beginner', 'charting'],
  },
  {
    slug: 'moving-average',
    term: 'Moving Average',
    definition:
      'An indicator that smooths price data by averaging price over a fixed number of past periods, used to identify trend direction and reduce short-term noise.',
    categorySlug: 'technical-analysis',
    tags: ['beginner', 'charting'],
  },
  {
    slug: 'support-resistance',
    term: 'Support and Resistance',
    definition:
      'Price levels where an asset has historically had difficulty falling below (support) or rising above (resistance), often used to anticipate reversals or breakouts.',
    categorySlug: 'technical-analysis',
    tags: ['beginner', 'charting'],
  },
  {
    slug: 'implied-volatility',
    term: 'Implied Volatility (IV)',
    definition:
      "The market's forecast of a security's likely price movement, derived from the price of its options; higher IV means options are more expensive.",
    categorySlug: 'options-trading',
    tags: ['options', 'intermediate'],
  },
  {
    slug: 'stop-loss-order',
    term: 'Stop-Loss Order',
    definition:
      "An order placed with a broker to buy or sell a security once it reaches a specified price, designed to limit an investor's loss on a position.",
    categorySlug: 'risk-management',
    tags: ['beginner', 'risk'],
  },
  {
    slug: 'price-earnings-ratio',
    term: 'Price-to-Earnings (P/E) Ratio',
    definition:
      "A valuation ratio calculated by dividing a company's current share price by its earnings per share, used to gauge whether a stock is over- or under-valued relative to earnings.",
    categorySlug: 'fundamental-analysis',
    tags: ['beginner'],
  },
  {
    slug: 'market-capitalization',
    term: 'Market Capitalization',
    definition:
      "The total market value of a company's outstanding shares, calculated as share price multiplied by shares outstanding.",
    categorySlug: 'fundamental-analysis',
    tags: ['beginner'],
  },
  {
    slug: 'liquidity',
    term: 'Liquidity',
    definition:
      'The degree to which an asset can be quickly bought or sold in the market without significantly affecting its price.',
    categorySlug: undefined as string | undefined,
    tags: ['beginner'],
  },
  {
    slug: 'bid-ask-spread',
    term: 'Bid-Ask Spread',
    definition:
      'The difference between the highest price a buyer is willing to pay (bid) and the lowest price a seller is willing to accept (ask) for an asset.',
    categorySlug: undefined as string | undefined,
    tags: ['beginner'],
  },
  {
    slug: 'position-sizing',
    term: 'Position Sizing',
    definition:
      'The process of determining how many shares or contracts to trade based on account size, risk tolerance, and the distance to a stop-loss level.',
    categorySlug: 'risk-management',
    tags: ['risk', 'intermediate'],
  },
];

const COURSES = [
  {
    slug: 'intro-to-technical-analysis',
    title: 'Introduction to Technical Analysis',
    description:
      'A beginner-friendly walkthrough of reading price charts, spotting trends, and using common indicators to time entries and exits.',
    categorySlug: 'technical-analysis',
    difficulty: 'beginner' as const,
    tags: ['beginner', 'charting'],
    lessons: [
      {
        slug: 'what-is-technical-analysis',
        title: 'What Is Technical Analysis?',
        orderIndex: 0,
        content:
          "Technical analysis is the study of historical price and volume data to forecast future price movement. Rather than evaluating a company's financial statements, technical analysts look at charts, patterns, and indicators derived from how an asset has actually traded. The underlying assumption is that price action reflects all available information and that prices tend to move in identifiable trends that can repeat over time. Technical analysis is commonly used to time entries and exits, while fundamental analysis is more often used to decide what to buy in the first place -- many traders use both together.",
      },
      {
        slug: 'reading-candlestick-charts',
        title: 'Reading Candlestick Charts',
        orderIndex: 1,
        content:
          "A candlestick represents price action over a chosen time period (a minute, an hour, a day) using four data points: open, high, low, and close. The 'body' of the candle shows the range between the open and close, colored to indicate whether the close was higher or lower than the open. The thin lines above and below the body, called wicks or shadows, show the highest and lowest prices reached during that period. Patterns formed by one or more candlesticks -- such as dojis, hammers, and engulfing patterns -- are used by traders to gauge shifts in buying and selling pressure.",
      },
      {
        slug: 'using-moving-averages',
        title: 'Using Moving Averages to Spot Trends',
        orderIndex: 2,
        content:
          'A moving average calculates the average price of an asset over a fixed number of recent periods, updating as new data arrives. Shorter moving averages (e.g. 20-period) react quickly to price changes, while longer moving averages (e.g. 200-period) react more slowly and are often used to gauge the broader trend. When a shorter moving average crosses above a longer one, it is often read as a bullish signal; when it crosses below, a bearish signal. Because moving averages are based entirely on past prices, they tend to lag actual price turns rather than predict them.',
      },
    ],
    quiz: {
      slug: 'intro-to-technical-analysis-quiz',
      title: 'Introduction to Technical Analysis -- Quiz',
      questions: [
        {
          question: 'What does RSI stand for?',
          options: [
            'Relative Strength Index',
            'Rate of Stock Increase',
            'Real Support Indicator',
            'Relative Stop Interval',
          ],
          correctOptionIndex: 0,
          explanation: 'RSI (Relative Strength Index) is a momentum oscillator scaled from 0 to 100.',
        },
        {
          question: 'A moving average smooths price data by:',
          options: [
            'Averaging price over a set number of past periods',
            'Predicting future earnings',
            'Measuring trading volume only',
            'Removing all price history',
          ],
          correctOptionIndex: 0,
          explanation:
            'Moving averages recalculate an average price over a rolling window, which filters out short-term noise.',
        },
        {
          question: 'An RSI reading above 70 is typically considered:',
          options: ['Oversold', 'Overbought', 'Neutral', 'Invalid'],
          correctOptionIndex: 1,
          explanation:
            'Traditionally, RSI above 70 signals overbought conditions, while below 30 signals oversold conditions.',
        },
      ],
    },
  },
  {
    slug: 'intro-to-risk-management',
    title: 'Introduction to Risk Management',
    description:
      'Core principles for protecting trading capital: position sizing, stop losses, and diversification.',
    categorySlug: 'risk-management',
    difficulty: 'beginner' as const,
    tags: ['beginner', 'risk'],
    lessons: [
      {
        slug: 'why-risk-management-matters',
        title: 'Why Risk Management Matters',
        orderIndex: 0,
        content:
          'Risk management is the set of practices traders use to control how much capital they can lose on any single trade or over a series of trades. Even a strategy with a high win rate can be ruined by position sizes that are too large relative to account size, because a small number of outsized losses can outweigh many small wins. Professional traders typically risk a small, fixed percentage of their account (often 1-2%) on any single idea, which keeps a losing streak from causing irreversible damage to the account. Risk management does not predict which trades will win or lose -- it controls the consequences when a trade goes wrong.',
      },
      {
        slug: 'position-sizing-basics',
        title: 'Position Sizing Basics',
        orderIndex: 1,
        content:
          'Position sizing determines how many shares or contracts to trade based on account size, the amount of capital at risk, and the distance between the entry price and the stop-loss level. For example, a trader risking 1% of a $50,000 account ($500) with a stop loss $2 away from entry could buy up to 250 shares before exceeding that risk budget. Position sizing keeps risk consistent across trades with different stop-loss distances, rather than trading a fixed number of shares regardless of how far away the stop is.',
      },
      {
        slug: 'setting-effective-stop-losses',
        title: 'Setting Effective Stop-Losses',
        orderIndex: 2,
        content:
          'A stop-loss order tells a broker to exit a position automatically once price reaches a specified level, converting an open-ended risk into a defined one. Stop levels are typically set based on a technical reference point -- such as below a recent swing low, or a multiple of a volatility measure like average true range -- rather than an arbitrary dollar amount, so the stop reflects where the original trade idea would actually be proven wrong. Setting a stop too tight risks being stopped out by normal price noise; setting it too wide risks losing more than the position sizing plan intended.',
      },
    ],
    quiz: {
      slug: 'intro-to-risk-management-quiz',
      title: 'Introduction to Risk Management -- Quiz',
      questions: [
        {
          question: 'Position sizing primarily helps traders:',
          options: [
            'Control how much capital is at risk per trade',
            'Predict market direction',
            'Avoid paying commissions',
            'Guarantee profits',
          ],
          correctOptionIndex: 0,
          explanation:
            "Position sizing determines trade size based on account risk tolerance, independent of market direction.",
        },
        {
          question: 'A stop-loss order automatically:',
          options: [
            'Increases position size',
            'Closes a position at a specified price to limit loss',
            'Cancels all pending orders',
            'Converts a stock position to options',
          ],
          correctOptionIndex: 1,
          explanation:
            'A stop-loss triggers an exit once price reaches the specified level, capping downside on the position.',
        },
        {
          question: 'Diversification reduces risk mainly by:',
          options: [
            'Concentrating capital in one high-conviction trade',
            'Spreading exposure across multiple uncorrelated positions',
            'Increasing leverage',
            'Avoiding stop losses',
          ],
          correctOptionIndex: 1,
          explanation:
            "Spreading capital across uncorrelated positions reduces the impact of any single position's adverse move.",
        },
      ],
    },
  },
];

const STRATEGIES = [
  {
    slug: 'moving-average-crossover',
    name: 'Moving Average Crossover',
    description:
      'A trend-following strategy that generates buy/sell signals when a shorter-period moving average crosses above or below a longer-period moving average.',
    categorySlug: 'technical-analysis',
    difficulty: 'beginner' as const,
    tags: ['beginner', 'charting'],
  },
  {
    slug: 'covered-call',
    name: 'Covered Call',
    description:
      'An options income strategy where a trader holding a long stock position sells call options against it to collect premium, capping upside in exchange for income.',
    categorySlug: 'options-trading',
    difficulty: 'intermediate' as const,
    tags: ['options', 'intermediate'],
  },
  {
    slug: 'mean-reversion',
    name: 'Mean Reversion',
    description:
      'A strategy based on the assumption that prices eventually move back toward their historical average, entering positions when price deviates significantly from a moving average or other baseline.',
    categorySlug: 'technical-analysis',
    difficulty: 'intermediate' as const,
    tags: ['charting', 'intermediate'],
  },
];

export async function seedEducationContent(deps: SeedDeps): Promise<SeedCounts> {
  const counts: SeedCounts = { inserted: 0, skipped: 0 };
  const log = (action: 'inserted' | 'skipped', kind: string, slug: string): void => {
    counts[action] += 1;
    deps.logger.info({ action, kind, slug }, `seed: ${action} ${kind} ${slug}`);
  };

  // --- Categories ------------------------------------------------------
  const existingCategories = await deps.categoryRepo.list();
  const categoryBySlug = new Map(existingCategories.map((c) => [c.slug, c]));
  for (const cat of CATEGORIES) {
    if (categoryBySlug.has(cat.slug)) {
      log('skipped', 'category', cat.slug);
      continue;
    }
    const row = await deps.categoryRepo.create(cat);
    categoryBySlug.set(row.slug, row);
    log('inserted', 'category', cat.slug);
  }

  // --- Tags --------------------------------------------------------------
  const existingTags = await deps.tagRepo.list();
  const tagBySlug = new Map(existingTags.map((t) => [t.slug, t]));
  for (const tag of TAGS) {
    if (tagBySlug.has(tag.slug)) {
      log('skipped', 'tag', tag.slug);
      continue;
    }
    const row = await deps.tagRepo.create(tag);
    tagBySlug.set(row.slug, row);
    log('inserted', 'tag', tag.slug);
  }

  // Attaches a content item's declared tags, skipping any already attached.
  // Unknown tag slugs are ignored rather than thrown -- a typo in this
  // file's own seed data should never crash a service boot.
  async function attachTags(contentType: ContentType, contentId: string, tagSlugs: readonly string[] | undefined) {
    if (!tagSlugs || tagSlugs.length === 0) return;
    const attached = await deps.contentTagRepo.listForContent(contentType, contentId);
    const attachedIds = new Set(attached.map((t) => t.id));
    for (const tagSlug of tagSlugs) {
      const tag = tagBySlug.get(tagSlug);
      if (!tag || attachedIds.has(tag.id)) continue;
      await deps.contentTagRepo.attach(contentType, contentId, tag.id);
    }
  }

  // --- Glossary ------------------------------------------------------------
  for (const term of GLOSSARY_TERMS) {
    const category = term.categorySlug ? categoryBySlug.get(term.categorySlug) : undefined;
    let row = await deps.glossaryRepo.getBySlug(term.slug);
    if (row) {
      log('skipped', 'glossary term', term.slug);
    } else {
      row = await deps.glossaryRepo.create({
        slug: term.slug,
        term: term.term,
        definition: term.definition,
        categoryId: category?.id,
        status: 'published',
      });
      log('inserted', 'glossary term', term.slug);
    }
    await attachTags('glossary_term', row.id, term.tags);
  }

  // --- Courses (+ lessons + quiz + questions) -------------------------------
  for (const courseDef of COURSES) {
    const category = courseDef.categorySlug ? categoryBySlug.get(courseDef.categorySlug) : undefined;
    let course = await deps.courseRepo.getBySlug(courseDef.slug);
    if (course) {
      log('skipped', 'course', courseDef.slug);
    } else {
      course = await deps.courseRepo.create({
        slug: courseDef.slug,
        title: courseDef.title,
        description: courseDef.description,
        categoryId: category?.id,
        difficulty: courseDef.difficulty,
        status: 'published',
      });
      log('inserted', 'course', courseDef.slug);
    }
    await attachTags('course', course.id, courseDef.tags);

    for (const lessonDef of courseDef.lessons) {
      const existingLesson = await deps.lessonRepo.getBySlug(course.id, lessonDef.slug);
      if (existingLesson) {
        log('skipped', 'lesson', `${courseDef.slug}/${lessonDef.slug}`);
        continue;
      }
      await deps.lessonRepo.create({
        courseId: course.id,
        slug: lessonDef.slug,
        title: lessonDef.title,
        content: lessonDef.content,
        orderIndex: lessonDef.orderIndex,
        status: 'published',
      });
      log('inserted', 'lesson', `${courseDef.slug}/${lessonDef.slug}`);
    }

    const quizDef = courseDef.quiz;
    let quiz = await deps.quizRepo.getBySlug(quizDef.slug);
    if (quiz) {
      log('skipped', 'quiz', quizDef.slug);
    } else {
      quiz = await deps.quizRepo.create({
        slug: quizDef.slug,
        title: quizDef.title,
        courseId: course.id,
        status: 'published',
      });
      log('inserted', 'quiz', quizDef.slug);
    }

    const existingQuestions = await deps.quizQuestionRepo.listByQuiz(quiz.id);
    if (existingQuestions.length > 0) {
      // Log one skip event per already-seeded row (not one per quiz) so
      // `counts.skipped` is a true row count on a re-run, matching the
      // insert branch's per-row granularity below -- see Delta's charter
      // rule 3 ("logs row counts").
      for (const q of existingQuestions) {
        log('skipped', 'quiz question', `${quizDef.slug}#${q.orderIndex}`);
      }
    } else {
      for (const [i, q] of quizDef.questions.entries()) {
        await deps.quizQuestionRepo.create({
          quizId: quiz.id,
          question: q.question,
          options: q.options,
          correctOptionIndex: q.correctOptionIndex,
          explanation: q.explanation,
          orderIndex: i,
        });
        log('inserted', 'quiz question', `${quizDef.slug}#${i}`);
      }
    }
  }

  // --- Strategies ------------------------------------------------------------
  for (const strategyDef of STRATEGIES) {
    const category = strategyDef.categorySlug ? categoryBySlug.get(strategyDef.categorySlug) : undefined;
    let row = await deps.strategyRepo.getBySlug(strategyDef.slug);
    if (row) {
      log('skipped', 'strategy', strategyDef.slug);
    } else {
      row = await deps.strategyRepo.create({
        slug: strategyDef.slug,
        name: strategyDef.name,
        description: strategyDef.description,
        categoryId: category?.id,
        difficulty: strategyDef.difficulty,
        status: 'published',
      });
      log('inserted', 'strategy', strategyDef.slug);
    }
    await attachTags('strategy', row.id, strategyDef.tags);
  }

  deps.logger.info({ counts }, 'seed: education content seeding complete');
  return counts;
}
