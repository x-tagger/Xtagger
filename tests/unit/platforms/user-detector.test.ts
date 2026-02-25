/**
 * @file user-detector.test.ts
 * @description Unit tests for UserDetector using jsdom.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus }     from '../../../src/core/events/event-bus';
import { NoopLogger }   from '../../../src/shared/logger';
import { SelectorEngine } from '../../../src/platforms/x.com/selector-engine';
import { UserDetector }   from '../../../src/platforms/x.com/user-detector';
import type { SelectorConfig } from '../../../src/platforms/x.com/selector-engine';

// ─── Setup ────────────────────────────────────────────────────────────────────

const CONFIG: SelectorConfig = {
  selectorVersion: 1,
  lastVerified: '2025-01-01',
  platform: 'x.com',
  selectors: {
    userNameContainer: {
      description: 'Username container',
      strategies: [
        { type: 'testid', value: '[data-testid="User-Name"]' },
      ],
    },
  },
};

function buildDetector() {
  const bus = new EventBus();
  const log = new NoopLogger();
  const selectors = new SelectorEngine(bus, log);
  selectors.loadConfig(CONFIG);
  return new UserDetector(selectors, log);
}

/** Simulate a typical X.com tweet card DOM structure */
function tweetHTML(username: string, displayName = 'Test User'): string {
  return `
    <div data-testid="cellInnerDiv">
      <article role="article">
        <div data-testid="User-Name">
          <a href="https://x.com/${username}" role="link">
            <span>${displayName}</span>
          </a>
          <a href="https://x.com/${username}" role="link">
            <span>@${username}</span>
          </a>
        </div>
        <div>Tweet content here</div>
      </article>
    </div>
  `;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UserDetector', () => {
  let detector: UserDetector;

  beforeEach(() => {
    detector = buildDetector();
    document.body.innerHTML = '';
  });

  describe('detect()', () => {
    it('detects a single user in a tweet', () => {
      document.body.innerHTML = tweetHTML('alice');
      const detections = detector.detect(document.body);
      expect(detections.length).toBe(1);
      expect(detections[0]?.userId.username).toBe('alice');
      expect(detections[0]?.userId.platform).toBe('x.com');
    });

    it('detects multiple users in a feed', () => {
      document.body.innerHTML = tweetHTML('alice') + tweetHTML('bob') + tweetHTML('charlie');
      const detections = detector.detect(document.body);
      expect(detections.length).toBe(3);
      const usernames = detections.map(d => d.userId.username);
      expect(usernames).toContain('alice');
      expect(usernames).toContain('bob');
      expect(usernames).toContain('charlie');
    });

    it('deduplicates repeated usernames in the same scan', () => {
      // Same user appearing in quote tweet + original
      document.body.innerHTML = tweetHTML('alice') + tweetHTML('alice');
      const detections = detector.detect(document.body);
      expect(detections.length).toBe(1);
    });

    it('returns empty array when no users found', () => {
      document.body.innerHTML = '<div>No tweets here</div>';
      const detections = detector.detect(document.body);
      expect(detections.length).toBe(0);
    });

    it('provides injectionAnchor (User-Name container)', () => {
      document.body.innerHTML = tweetHTML('alice');
      const detections = detector.detect(document.body);
      expect(detections[0]?.injectionAnchor).toBeTruthy();
      const anchor = detections[0]?.injectionAnchor as Element;
      expect(anchor.getAttribute('data-testid')).toBe('User-Name');
    });
  });

  describe('username extraction', () => {
    it('extracts username from href (preferred method)', () => {
      document.body.innerHTML = tweetHTML('testuser123');
      const d = detector.detect(document.body);
      expect(d[0]?.userId.username).toBe('testuser123');
    });

    it('handles usernames with underscores', () => {
      document.body.innerHTML = tweetHTML('test_user_99');
      const d = detector.detect(document.body);
      expect(d[0]?.userId.username).toBe('test_user_99');
    });

    it('normalises username to lowercase', () => {
      document.body.innerHTML = tweetHTML('TestUser');
      const d = detector.detect(document.body);
      expect(d[0]?.userId.username).toBe('testuser');
    });

    it('ignores reserved X.com paths like /home', () => {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv">
          <div data-testid="User-Name">
            <a href="https://x.com/home" role="link"><span>Home</span></a>
          </div>
        </div>
      `;
      const d = detector.detect(document.body);
      expect(d.length).toBe(0);
    });

    it('ignores paths with multiple segments (not a profile link)', () => {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv">
          <div data-testid="User-Name">
            <a href="https://x.com/alice/status/123456" role="link"><span>tweet</span></a>
          </div>
        </div>
      `;
      const d = detector.detect(document.body);
      // Should not detect "alice" from a status link
      expect(d.length).toBe(0);
    });
  });

  describe('detectInContainer()', () => {
    it('detects a user within a single container element', () => {
      document.body.innerHTML = tweetHTML('singleUser');
      const container = document.querySelector('[data-testid="cellInnerDiv"]')!;
      const detection = detector.detectInContainer(container);
      expect(detection).not.toBeNull();
      expect(detection?.userId.username).toBe('singleuser');
    });

    it('returns null when container has no user data', () => {
      document.body.innerHTML = '<div data-testid="cellInnerDiv"><p>No user</p></div>';
      const container = document.querySelector('[data-testid="cellInnerDiv"]')!;
      const detection = detector.detectInContainer(container);
      expect(detection).toBeNull();
    });
  });
});
