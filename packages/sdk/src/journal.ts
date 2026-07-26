// Task 9.6: all 4 /v1/journal routes -- the durable record of paper trades
// (Decision D16). Outcome columns are write-once; recording a second outcome
// on an already-closed entry throws SdkHttpError with status 409.
import type { HttpClient } from './http';
import type { CreateJournalEntryInput, JournalEntry, RecordOutcomeInput } from '@tradosphere/shared-types';

export class JournalClient {
  constructor(private readonly http: HttpClient) {}

  /** tradeIdea/cioVerdict are optional -- an untied trade is an honest gap, never fabricated. */
  createEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
    return this.http.request('POST', '/v1/journal/entries', { body: input });
  }
  listEntries(): Promise<{ entries: JournalEntry[] }> {
    return this.http.request('GET', '/v1/journal/entries');
  }
  getEntry(id: string): Promise<JournalEntry> {
    return this.http.request('GET', `/v1/journal/entries/${encodeURIComponent(id)}`);
  }
  /** 409 (thrown as SdkHttpError) if the entry is already closed. */
  recordOutcome(id: string, input: RecordOutcomeInput): Promise<JournalEntry> {
    return this.http.request('POST', `/v1/journal/entries/${encodeURIComponent(id)}/outcome`, { body: input });
  }
}
