const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function parsePagination(query = {}) {
  const parsePositiveInteger = (value, name, fallback, max = Infinity) => {
    if (value === undefined) return fallback;

    const text = String(value);

    if (!/^[1-9]\d*$/.test(text)) {
      const error = new Error(`${name} must be a positive integer`);
      error.status = 400;
      throw error;
    }

    const number = Number(text);

    if (!Number.isSafeInteger(number) || number > max) {
      const error = new Error(
        `${name} must be a positive integer no greater than ${max}`
      );
      error.status = 400;
      throw error;
    }

    return number;
  };

  return {
    page: parsePositiveInteger(query.page, "page", DEFAULT_PAGE),
    limit: parsePositiveInteger(query.limit, "limit", DEFAULT_LIMIT, MAX_LIMIT),
  };
}

module.exports = { parsePagination };
