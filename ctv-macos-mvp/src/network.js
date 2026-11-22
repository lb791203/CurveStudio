function fetchImplementation(options = {}) {
  const implementation = options.fetchImpl || globalThis.fetch;
  if (typeof implementation !== "function") {
    throw new Error("Fetch API is unavailable.");
  }
  return implementation;
}

async function requestResource(path, options = {}) {
  const label = options.label || path;
  let response;
  try {
    response = await fetchImplementation(options)(path);
  } catch (error) {
    throw new Error(`Cannot load ${label}: ${error.message || error}`);
  }
  if (!response || response.ok !== true) {
    throw new Error(`Cannot load ${label}: HTTP ${response?.status ?? "unknown"}`);
  }
  return { response, label };
}

export async function fetchTextResource(path, options = {}) {
  const { response, label } = await requestResource(path, options);
  try {
    return await response.text();
  } catch (error) {
    throw new Error(`Cannot read ${label}: ${error.message || error}`);
  }
}

export async function fetchJsonResource(path, options = {}) {
  const { response, label } = await requestResource(path, options);
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`Cannot parse ${label} as JSON: ${error.message || error}`);
  }
}
