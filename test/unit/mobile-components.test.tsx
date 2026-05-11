import React from 'react';
import { describe, it, expect } from '@jest/globals';
import { render, fireEvent } from '@testing-library/react-native';
import { MessageBubble } from '../../mobile/src/components/message-bubble';
import { InputBar } from '../../mobile/src/components/input-bar';
import { ApprovalCard } from '../../mobile/src/components/approval-card';
import { ErrorCard } from '../../mobile/src/components/error-card';

describe('MessageBubble', () => {
  it('renders user message correctly', () => {
    const message = {
      id: 'm1', sessionId: 's1', type: 'user' as const,
      content: 'Hello', seq: 1, timestamp: Date.now(), metadata: {}, status: 'sent' as const,
    };
    const { getByText } = render(<MessageBubble message={message} />);
    expect(getByText('Hello')).toBeTruthy();
  });

  it('renders AI message correctly', () => {
    const message = {
      id: 'm1', sessionId: 's1', type: 'assistant' as const,
      content: 'Hi there', seq: 1, timestamp: Date.now(), metadata: {}, status: 'sent' as const,
    };
    const { getByText } = render(<MessageBubble message={message} />);
    expect(getByText('Hi there')).toBeTruthy();
  });

  it('renders error message with fix button', () => {
    const message = {
      id: 'm1', sessionId: 's1', type: 'error' as const,
      content: 'Something went wrong', seq: 1, timestamp: Date.now(), metadata: {}, status: 'sent' as const,
    };
    const { getByText } = render(<MessageBubble message={message} />);
    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText('Let AI fix')).toBeTruthy();
  });

  it('renders tool call with file path', () => {
    const message = {
      id: 'm1', sessionId: 's1', type: 'tool_call' as const,
      content: 'Editing file', seq: 1, timestamp: Date.now(),
      metadata: { filePath: '/src/app.ts' }, status: 'sent' as const,
    };
    const { getByText } = render(<MessageBubble message={message} />);
    expect(getByText('Editing file')).toBeTruthy();
    expect(getByText('📄 /src/app.ts')).toBeTruthy();
  });

  it('shows sending status', () => {
    const message = {
      id: 'm1', sessionId: 's1', type: 'user' as const,
      content: 'Hello', seq: 1, timestamp: Date.now(), metadata: {}, status: 'sending' as const,
    };
    const { getByText } = render(<MessageBubble message={message} />);
    expect(getByText('Sending...')).toBeTruthy();
  });
});

describe('InputBar', () => {
  it('renders input and send button', () => {
    const onSend = jest.fn();
    const { getByPlaceholderText, getByText } = render(<InputBar onSend={onSend} />);
    expect(getByPlaceholderText('Type a message...')).toBeTruthy();
    expect(getByText('Send')).toBeTruthy();
  });

  it('calls onSend when button pressed', () => {
    const onSend = jest.fn();
    const { getByPlaceholderText, getByText } = render(<InputBar onSend={onSend} />);
    const input = getByPlaceholderText('Type a message...');
    fireEvent.changeText(input, 'Test message');
    fireEvent.press(getByText('Send'));
    expect(onSend).toHaveBeenCalledWith('Test message');
  });

  it('does not call onSend when input is empty', () => {
    const onSend = jest.fn();
    const { getByText } = render(<InputBar onSend={onSend} />);
    fireEvent.press(getByText('Send'));
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('ApprovalCard', () => {
  it('renders approval request', () => {
    const onRespond = jest.fn();
    const { getByText } = render(
      <ApprovalCard
        operation="Edit"
        target="/src/app.ts"
        risk="medium"
        onRespond={onRespond}
      />
    );
    expect(getByText('Edit')).toBeTruthy();
    expect(getByText('/src/app.ts')).toBeTruthy();
    expect(getByText('medium')).toBeTruthy();
  });

  it('calls onRespond with approved', () => {
    const onRespond = jest.fn();
    const { getByText } = render(
      <ApprovalCard operation="Edit" target="/src/app.ts" risk="low" onRespond={onRespond} />
    );
    fireEvent.press(getByText('Allow'));
    expect(onRespond).toHaveBeenCalledWith('approved');
  });

  it('calls onRespond with rejected', () => {
    const onRespond = jest.fn();
    const { getByText } = render(
      <ApprovalCard operation="Delete" target="/src/app.ts" risk="high" onRespond={onRespond} />
    );
    fireEvent.press(getByText('Deny'));
    expect(onRespond).toHaveBeenCalledWith('rejected');
  });
});

describe('ErrorCard', () => {
  it('renders error with retry', () => {
    const onRetry = jest.fn();
    const { getByText } = render(<ErrorCard code="ERR_001" message="Connection failed" onRetry={onRetry} />);
    expect(getByText('ERR_001')).toBeTruthy();
    expect(getByText('Connection failed')).toBeTruthy();
    expect(getByText('Retry')).toBeTruthy();
  });

  it('calls onRetry when pressed', () => {
    const onRetry = jest.fn();
    const { getByText } = render(<ErrorCard code="ERR_001" message="Failed" onRetry={onRetry} />);
    fireEvent.press(getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('renders without retry button', () => {
    const { getByText, queryByText } = render(<ErrorCard code="ERR_002" message="Fatal" />);
    expect(getByText('ERR_002')).toBeTruthy();
    expect(queryByText('Retry')).toBeNull();
  });
});
