export function isCI() {
  /*
  Circle CI, Actions and Travis CI have this variable set to `true` by default: 
    https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables
    https://circleci.com/docs/variables/#built-in-environment-variables
    https://docs.travis-ci.com/user/environment-variables/#default-environment-variables
  */
  return process.env.CI === 'true';
}
