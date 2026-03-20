// This setup file handles known vitest/axios compatibility issues.
// Axios response/error objects contain non-serializable functions (transformRequest,
// transformResponse, FormData) that cause DataCloneError when vitest tries to
// serialize them across worker boundaries. This does not affect test correctness.
// See: https://github.com/vitest-dev/vitest/issues/3076
