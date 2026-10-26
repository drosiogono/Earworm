// Prefer Vite envs; allow overriding API base via VITE_API_URL in any mode
function normalizeBaseUrl(raw) {
  let v = raw ?? '';
  if (typeof v !== 'string') v = String(v);
  v = v.trim();
  // Handle cases like '""' or "''" injected by build-time env
  if (v === '""' || v === "''") v = '';
  // Strip surrounding quotes and any stray quotes
  v = v.replace(/^['"]+|['"]+$/g, '');
  v = v.replace(/["']/g, '');
  // Remove trailing slashes
  v = v.replace(/\/+$/g, '');
  return v;
}

const API_BASE_URL = normalizeBaseUrl(
  (typeof import.meta !== 'undefined' && import.meta.env && 'VITE_API_URL' in import.meta.env)
    ? import.meta.env.VITE_API_URL
    : '' // Use relative /api in both dev and prod; Vite proxy handles dev, nginx handles prod
);

class ApiService {
  constructor() {
    this.token = null;
    this.authRefreshHandler = null;
    this.authRefreshPromise = null;
  }

  setAuthToken(token) {
    this.token = token;
  }

  setAuthRefreshHandler(handler) {
    this.authRefreshHandler = handler;
  }

  async wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  shouldRetry(method, status) {
    const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method);
    const transientStatus = [408, 425, 429, 500, 502, 503, 504].includes(status);
    return safeMethod && transientStatus;
  }

  retryDelay(attempt, response) {
    const retryAfter = response?.headers?.get('Retry-After');
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.min(retryAfterSeconds * 1000, 10000);
    }
    return Math.min(500 * (2 ** attempt), 4000) + Math.round(Math.random() * 200);
  }

  async request(endpoint, options = {}) {
    // Safe-join base + endpoint, honoring relative mode when base is empty
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    // If base is a relative prefix like '/api', and endpoint already starts with '/api',
    // avoid double-prefixing (i.e., '/api' + '/api/config' -> '/api/config').
    const base = API_BASE_URL;
    let url;
    if (!base) {
      url = path;
    } else if (/^https?:\/\//i.test(base)) {
      url = `${base}${path}`;
    } else {
      // Treat base as a path prefix
      const baseNoTrail = base.replace(/\/+$/g, '');
      if (path === baseNoTrail || path.startsWith(`${baseNoTrail}/`)) {
        url = path; // endpoint already includes the base prefix
      } else {
        url = `${baseNoTrail}${path}`;
      }
    }
    const { skipAuthRefresh = false, maxRetries = 2, ...fetchOptions } = options;
    const method = (fetchOptions.method || 'GET').toUpperCase();
    const config = {
      headers: {
        ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...fetchOptions.headers,
      },
      ...fetchOptions,
    };

    if (this.token) {
      config.headers.Authorization = `Bearer ${this.token}`;
      // console.log('API Request with token:', this.token.substring(0, 20) + '...');
    } else {
      // console.log('API Request WITHOUT token');
    }

    let attempt = 0;
    let authRetried = false;
    while (true) {
      let response;
      try {
        response = await fetch(url, config);
      } catch (error) {
        if (attempt < maxRetries && ['GET', 'HEAD', 'OPTIONS'].includes(method)) {
          await this.wait(this.retryDelay(attempt));
          attempt += 1;
          continue;
        }
        throw new Error(`Network request failed after ${attempt + 1} attempt(s): ${error.message}`);
      }

      if (response.status === 401 && !skipAuthRefresh && !authRetried && this.authRefreshHandler) {
        try {
          if (!this.authRefreshPromise) {
            this.authRefreshPromise = this.authRefreshHandler().finally(() => {
              this.authRefreshPromise = null;
            });
          }
          await this.authRefreshPromise;
          authRetried = true;
          if (this.token) {
            config.headers.Authorization = `Bearer ${this.token}`;
            continue;
          }
        } catch (refreshError) {
          throw new Error(`Authentication expired and could not be renewed: ${refreshError.message}`);
        }
      }

      if (!response.ok) {
        if (attempt < maxRetries && this.shouldRetry(method, response.status)) {
          await this.wait(this.retryDelay(attempt, response));
          attempt += 1;
          continue;
        }
        // Try to parse JSON error, else include text snippet to aid debugging
        let errorMessage = `HTTP error! status: ${response.status}`;
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData && (errorData.error || errorData.message)) {
            errorMessage = errorData.error || errorData.message;
          }
        } else {
          const text = await response.text().catch(() => '');
          if (text) errorMessage += ` | body: ${text.slice(0, 200)}`;
        }
        throw new Error(`${errorMessage} (after ${attempt + 1} attempt(s))`);
      }
      // Parse JSON safely
      const ct = response.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Expected JSON but received: ${ct || 'unknown'} | body: ${text.slice(0, 200)}`);
      }
      return await response.json();
    }
  }

  // Public config
  async getPublicConfig() {
    return this.request('/api/config');
  }

  // Authentication endpoints
  async googleAuth(googleToken) {
    return this.request('/api/auth/google', {
      method: 'POST',
      skipAuthRefresh: true,
      body: JSON.stringify({ token: googleToken }),
    });
  }

  async localLogin() {
    return this.request('/api/auth/local/login', {
      method: 'POST',
      skipAuthRefresh: true,
    });
  }

  async verifyToken(token) {
    return this.request('/api/auth/verify', {
      method: 'POST',
      skipAuthRefresh: true,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  // Mood entries endpoints
  async getMoodEntries() {
    return this.request('/api/moods');
  }

  // Earworm music journal endpoints
  async searchEarwormMusic(query) {
    return this.request(`/api/earworm/music/search?q=${encodeURIComponent(query)}`);
  }

  async getEarwormEntries({ start, end } = {}) {
    const params = new URLSearchParams();
    if (start) params.set('start_date', start);
    if (end) params.set('end_date', end);
    const query = params.toString();
    return this.request(`/api/earworm/entries${query ? `?${query}` : ''}`);
  }

  async createEarwormEntry(entry) {
    return this.request('/api/earworm/entries', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  }

  async updateEarwormEntry(entryId, patch) {
    return this.request(`/api/earworm/entries/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }

  async deleteEarwormEntry(entryId) {
    return this.request(`/api/earworm/entries/${entryId}`, { method: 'DELETE' });
  }

  async createMoodEntry(entryData) {
    return this.request('/api/mood', {
      method: 'POST',
      body: JSON.stringify(entryData),
    });
  }

  async updateMoodEntry(entryId, entryData) {
    return this.request(`/api/mood/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify(entryData),
    });
  }

  async deleteMoodEntry(entryId) {
    return this.request(`/api/mood/${entryId}`, {
      method: 'DELETE',
    });
  }

  // Statistics endpoints
  async getStatistics() {
    return this.request('/api/statistics');
  }

  // Streak endpoint
  async getCurrentStreak() {
    return this.request('/api/streak');
  }

  // Mood music endpoint
  async getMoodMusic(tag) {
    const encodedTag = encodeURIComponent(String(tag || 'chill'));
    return this.request(`/api/music/vibe?tag=${encodedTag}`);
  }

  // Groups endpoints
  async getGroups() {
    return this.request('/api/groups');
  }

  async createGroup(groupData) {
    return this.request('/api/groups', {
      method: 'POST',
      body: JSON.stringify(groupData),
    });
  }

  async createGroupOption(groupId, optionData) {
    return this.request(`/api/groups/${groupId}/options`, {
      method: 'POST',
      body: JSON.stringify(optionData),
    });
  }

  async deleteGroup(groupId) {
    return this.request(`/api/groups/${groupId}`, {
      method: 'DELETE',
    });
  }

  // Entry selections endpoint
  async getEntrySelections(entryId) {
    return this.request(`/api/mood/${entryId}/selections`);
  }

  // Achievement endpoints
  async getUserAchievements() {
    return this.request('/api/achievements');
  }

  async checkAchievements() {
    return this.request('/api/achievements/check', {
      method: 'POST',
    });
  }

  async getAchievementsProgress() {
    return this.request('/api/achievements/progress');
  }

  // Web3 minting removed

  // -------- Goals endpoints --------
  async getGoals() {
    return this.request('/api/goals');
  }

  async createGoal(goal) {
    // Accept { title, description, frequency_per_week } or { title, description, frequency }
    const payload = { ...goal };
    if (payload.frequency && !payload.frequency_per_week) {
      // frequency like '3 days a week' -> 3
      const n = parseInt(String(payload.frequency).trim(), 10);
      if (!Number.isNaN(n)) payload.frequency_per_week = n;
      delete payload.frequency;
    }
    return this.request('/api/goals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateGoal(goalId, patch) {
    const payload = { ...patch };
    if (payload.frequency && !payload.frequency_per_week) {
      const n = parseInt(String(payload.frequency).trim(), 10);
      if (!Number.isNaN(n)) payload.frequency_per_week = n;
      delete payload.frequency;
    }
    return this.request(`/api/goals/${goalId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteGoal(goalId) {
    return this.request(`/api/goals/${goalId}`, { method: 'DELETE' });
  }

  async incrementGoalProgress(goalId) {
    return this.request(`/api/goals/${goalId}/progress`, { method: 'POST' });
  }

  async getGoalCompletions(goalId, { start, end } = {}) {
    const params = new URLSearchParams();
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    const q = params.toString();
    return this.request(`/api/goals/${goalId}/completions${q ? `?${q}` : ''}`);
  }

  // Export endpoint
  async exportPdf(content) {
    const endpoint = '/api/export/pdf';
    const base = API_BASE_URL;
    let url;
    if (!base) url = endpoint;
    else if (/^https?:\/\//i.test(base)) url = `${base}${endpoint}`;
    else url = `${base.replace(/\/+$/g, '')}${endpoint}`;
    
    const config = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    };

    if (this.token) {
      config.headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, config);
    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`);
    }
    return response.blob();
  }
}

const apiService = new ApiService();
export default apiService;
