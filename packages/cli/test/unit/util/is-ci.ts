import { isCI } from '../../../src/util/is-ci';

describe('isCI', () => {
  it('should detect CI', () => {
    try {
      process.env.CI = 'true';
      expect(isCI()).toEqual(true);

      process.env.CI = 'nope';
      expect(isCI()).toEqual(false);

      delete process.env.CI;
      expect(isCI()).toEqual(false);
    } finally {
      delete process.env.CI;
    }
  });
});
