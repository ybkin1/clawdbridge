import { describe, it, expect, beforeEach } from '@jest/globals';
import { initDB } from '../src/db/database';
import { KVStoreDAO } from '../src/db/kv-store-dao';

describe('MP08: KVStoreDAO', () => {
  beforeEach(async () => { await initDB(); });

  it('should store and retrieve value', async () => {
    await KVStoreDAO.set('access_token', 'jwt-123');
    const val = await KVStoreDAO.get('access_token');
    expect(val).toBe('jwt-123');
  });

  it('should return null for unset key', async () => {
    expect(await KVStoreDAO.get('missing')).toBeNull();
  });

  it('should delete value', async () => {
    await KVStoreDAO.set('temp', 'data');
    await KVStoreDAO.delete('temp');
    expect(await KVStoreDAO.get('temp')).toBeNull();
  });
});
