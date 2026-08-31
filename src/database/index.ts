export { getSupabaseClient, _resetSupabaseClient } from './client.js';
export type { Database } from './types.js';
export type {
  SourceChannelRow,
  SourceChannelInsert,
  SourceMessageRow,
  SourceMessageInsert,
  OpportunityRow,
  OpportunityInsert,
} from './types.js';
export {
  SourceChannelsRepository,
  SourceMessagesRepository,
  OpportunitiesRepository,
} from './repositories/index.js';
