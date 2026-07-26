// Sprint 9 task 9.2 prerequisite: services/research has never had a package
// entry point before now because nothing outside this service imported from
// it -- Sprint 4's five analysis modules were only ever wired directly into
// services/cio's agents by file path within the same workspace package. The
// gateway (apps/api) is the first true external consumer, so it needs one
// stable barrel to import from rather than reaching into individual files.
//
// Deliberately does NOT re-export ./indicators: every analysis module here
// already composes the raw indicators internally and returns a typed
// ResearchGap instead of letting InsufficientDataError escape (see
// technical.ts), so no outside consumer has needed a raw indicator function
// or InsufficientDataError directly. Add it later if that changes.
export * from './technical';
export * from './options';
export * from './fundamentals-ingest';
export * from './fundamentals-repository';
export * from './fundamentals';
export * from './sector';
export * from './quant';
