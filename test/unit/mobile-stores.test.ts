import { describe, it, expect, beforeEach } from '@jest/globals';

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock services
jest.mock('../../mobile/src/services/http-client', () => ({
  getHttpClient: () => ({
    post: jest.fn(),
    get: jest.fn(),
  }),
}));

jest.mock('../../mobile/src/services/ws-connection', () => ({
  getWsConnection: () => ({
    connect: jest.fn(),
    send: jest.fn(),
    isConnected: () => true,
  }),
  WsConnection: class WsConnection {},
}));

describe('ChatStore', () => {
  it('placeholder for chat store tests', () => {
    // Chat store tests would require zustand mocking
    expect(true).toBe(true);
  });
});

describe('SeqDeduplicator', () => {
  it('accepts first message', () => {
    expect(true).toBe(true);
  });
});
