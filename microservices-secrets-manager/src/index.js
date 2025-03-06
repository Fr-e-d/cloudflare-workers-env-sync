export default {
  async fetch(request, env) {
    console.log('🚀 Starting request processing');
    
    // Extract parameters and headers
    const url = new URL(request.url);
    const targetEnvironment = url.searchParams.get('env') || 'development';
    console.log(`📋 Target environment: ${targetEnvironment}`);
    
    const authHeader = request.headers.get('Authorization') || '';
    const nonce = request.headers.get('X-Request-Nonce');
    const timestamp = request.headers.get('X-Request-Timestamp');
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    
    console.log(`🔑 Received headers: Nonce=${nonce?.substring(0, 8)}..., Timestamp=${timestamp}`);
    console.log(`👤 Request from IP: ${clientIP}`);
    
    if (!nonce || !timestamp) {
      console.error('❌ Missing parameters: nonce or timestamp');
      return new Response('Invalid parameters', { 
        status: 400,
        headers: addNoCacheHeaders()
      });
    }
    
    // Check request freshness (5 minutes max)
    const requestTime = parseInt(timestamp, 10);
    const currentTime = Date.now();
    const timeDiff = currentTime - requestTime;
    console.log(`⏱️ Time difference: ${timeDiff}ms (max allowed: ${5 * 60 * 1000}ms)`);
    
    if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
      console.error(`❌ Request expired: ${timeDiff}ms > ${5 * 60 * 1000}ms`);
      return new Response('Request expired', { 
        status: 401,
        headers: addNoCacheHeaders()
      });
    }
    
    // Rate limiting implementation
    try {
      const rateLimitResult = await this.checkRateLimit(clientIP, env);
      if (!rateLimitResult.success) {
        console.error(`🛑 Rate limit exceeded for IP: ${clientIP}`);
        return new Response('Too many requests', { 
          status: 429,
          headers: addNoCacheHeaders({
            'Retry-After': rateLimitResult.retryAfter.toString()
          })
        });
      }
    } catch (error) {
      console.error(`❌ Error checking rate limit: ${error.message}`);
      // Continue processing even if rate limiting fails
    }
    
    // Authentication verification
    console.log('🔐 Verifying authentication...');
    const isValid = await this.isValidAuth(authHeader, nonce, timestamp, targetEnvironment, env);
    console.log(`🔐 Authentication result: ${isValid ? 'Success ✅' : 'Failure ❌'}`);
    
    if (!isValid) {
      // Track failed authentication attempts for rate limiting
      try {
        await this.recordFailedAttempt(clientIP, env);
      } catch (error) {
        console.error(`❌ Error recording failed attempt: ${error.message}`);
      }
      
      console.error('❌ Authentication failed');
      return new Response('Unauthorized', { 
        status: 401,
        headers: addNoCacheHeaders()
      });
    }

    // Reset failed attempts counter on successful authentication
    try {
      await this.resetFailedAttempts(clientIP, env);
    } catch (error) {
      console.error(`❌ Error resetting failed attempts: ${error.message}`);
    }

    try {
      console.log('🔍 Searching for variables and secrets for the environment');
      // New format: using an environment suffix instead of a worker prefix
      const envSuffix = `_${targetEnvironment}`;
      
      // Filter environment variables for this environment
      const variables = {};
      const secrets = {};
      
      // Loop through all environment variables
      let variableCount = 0;
      let secretCount = 0;
      
      for (const key in env) {
        // Check if the key ends with the environment suffix
        if (key.endsWith(envSuffix)) {
          // Extract the base name of the variable (without the environment suffix)
          const baseKey = key.substring(0, key.length - envSuffix.length);
          
          // Determine if it's a secret or a normal variable
          if (baseKey.startsWith('SECRET_')) {
            // For secrets, remove the SECRET_ prefix for the API
            const secretKey = baseKey.replace('SECRET_', '');
            secrets[secretKey] = env[key];
            secretCount++;
            console.log(`🔒 Secret found: ${secretKey}`);
          } else {
            variables[baseKey] = env[key];
            variableCount++;
            console.log(`📝 Variable found: ${baseKey}`);
          }
        }
      }
      
      console.log(`📊 Summary: ${variableCount} variables and ${secretCount} secrets found for environment ${targetEnvironment}`);
      
      // Log access
      console.log(`👤 Access to configurations for environment ${targetEnvironment} from ${clientIP}`);
      
      console.log('✅ Request processed successfully');
      return new Response(JSON.stringify({ variables, secrets }), {
        headers: addNoCacheHeaders({ 'Content-Type': 'application/json' })
      });
    } catch (error) {
      console.error(`❌ Error during processing: ${error.message}`, error);
      return new Response(`Error: ${error.message}`, { 
        status: 500,
        headers: addNoCacheHeaders()
      });
    }
  },

  async isValidAuth(authHeader, nonce, timestamp, environment, env) {
    console.log('🔐 Starting authentication verification');
    
    // The master password is stored as a secret in the Worker
    const masterPassword = env.MASTER_PASSWORD;
    
    if (!masterPassword) {
      console.error('❌ MASTER_PASSWORD not configured in the Worker');
      return false;
    }
    
    // Extract signature
    const signature = authHeader.replace('Bearer ', '');
    console.log(`🔑 Received signature: ${signature.substring(0, 10)}...`);
    
    // Recreate the message to verify the signature
    const message = `${nonce}:${timestamp}:${environment}`;
    console.log(`📝 Message to verify: ${message}`);
    
    // Verify HMAC signature
    const encoder = new TextEncoder();
    const messageData = encoder.encode(message);
    const keyData = encoder.encode(masterPassword);
    
    try {
      console.log('🔄 Importing HMAC key');
      // Create an HMAC key from the password
      const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    
      console.log('🔄 Verifying HMAC signature');
      // Verify the signature
      const result = await crypto.subtle.verify(
      'HMAC',
      key,
      hexToArrayBuffer(signature),
      messageData
    );
      
      console.log(`🔐 HMAC verification result: ${result ? 'Valid ✅' : 'Invalid ❌'}`);
      return result;
    } catch (error) {
      console.error('❌ Error during signature verification:', error);
      return false;
    }
  },
  
  // Rate limiting functions
  async checkRateLimit(clientIP, env) {
    if (!env.USER_RATE_LIMIT_KV) {
      console.warn('⚠️ Rate limiting KV namespace not configured');
      return { success: true };
    }
    
    const now = Date.now();
    const windowSize = 60 * 60 * 1000; // 1 hour window
    const maxFailedAttempts = 10; // Maximum 10 failed attempts per hour
    
    // Get current rate limit data
    const rateLimitKey = `ratelimit:${clientIP}`;
    let rateLimitData;
    
    try {
      rateLimitData = await env.USER_RATE_LIMIT_KV.get(rateLimitKey, { type: 'json' });
    } catch (error) {
      console.error(`❌ Error retrieving rate limit data: ${error.message}`);
    }
    
    if (!rateLimitData) {
      rateLimitData = {
        failedAttempts: 0,
        firstFailedAttempt: now,
        lastAttempt: now,
        totalAttempts: 0
      };
    }
    
    // Reset if window has expired
    if (now - rateLimitData.firstFailedAttempt > windowSize) {
      rateLimitData = {
        failedAttempts: 0,
        firstFailedAttempt: now,
        lastAttempt: now,
        totalAttempts: rateLimitData.totalAttempts ? rateLimitData.totalAttempts + 1 : 1
      };
    } else {
      // Increment total attempts counter
      rateLimitData.totalAttempts = (rateLimitData.totalAttempts || 0) + 1;
      rateLimitData.lastAttempt = now;
    }
    
    // Store updated rate limit data
    await env.USER_RATE_LIMIT_KV.put(rateLimitKey, JSON.stringify(rateLimitData), {
      expirationTtl: 86400 // 24 hours
    });
    
    // Check if rate limit is exceeded - only based on failed attempts
    if (rateLimitData.failedAttempts >= maxFailedAttempts) {
      const resetTime = rateLimitData.firstFailedAttempt + windowSize;
      const retryAfter = Math.ceil((resetTime - now) / 1000);
      
      console.log(`🛑 Rate limit exceeded: ${rateLimitData.failedAttempts}/${maxFailedAttempts} failed attempts`);
      return {
        success: false,
        retryAfter: retryAfter
      };
    }
    
    return { success: true };
  },
  
  async recordFailedAttempt(clientIP, env) {
    if (!env.USER_RATE_LIMIT_KV) {
      return;
    }
    
    const rateLimitKey = `ratelimit:${clientIP}`;
    let rateLimitData;
    
    try {
      rateLimitData = await env.USER_RATE_LIMIT_KV.get(rateLimitKey, { type: 'json' });
    } catch (error) {
      console.error(`❌ Error retrieving rate limit data: ${error.message}`);
    }
    
    if (!rateLimitData) {
      rateLimitData = {
        failedAttempts: 0,
        firstFailedAttempt: Date.now(),
        lastAttempt: Date.now(),
        totalAttempts: 1
      };
    }
    
    // If this is the first failed attempt in this window, record the time
    if (rateLimitData.failedAttempts === 0) {
      rateLimitData.firstFailedAttempt = Date.now();
    }
    
    // Increment failed attempts counter
    rateLimitData.failedAttempts = (rateLimitData.failedAttempts || 0) + 1;
    rateLimitData.lastAttempt = Date.now();
    
    // Store updated rate limit data with longer expiration for repeated offenders
    const expirationTtl = Math.min(86400 * 7, 86400 + (rateLimitData.failedAttempts * 3600));
    
    await env.USER_RATE_LIMIT_KV.put(rateLimitKey, JSON.stringify(rateLimitData), {
      expirationTtl: expirationTtl
    });
    
    console.log(`⚠️ Recorded failed attempt for IP ${clientIP}. Total failed: ${rateLimitData.failedAttempts}`);
  },
  
  async resetFailedAttempts(clientIP, env) {
    if (!env.USER_RATE_LIMIT_KV) {
      return;
    }
    
    const rateLimitKey = `ratelimit:${clientIP}`;
    let rateLimitData;
    
    try {
      rateLimitData = await env.USER_RATE_LIMIT_KV.get(rateLimitKey, { type: 'json' });
    } catch (error) {
      console.error(`❌ Error retrieving rate limit data: ${error.message}`);
      return;
    }
    
    if (rateLimitData && rateLimitData.failedAttempts > 0) {
      // Reset failed attempts on successful authentication
      rateLimitData.failedAttempts = 0;
      
      await env.USER_RATE_LIMIT_KV.put(rateLimitKey, JSON.stringify(rateLimitData), {
        expirationTtl: 86400 // 24 hours
      });
      
      console.log(`✅ Reset failed attempts counter for IP ${clientIP}`);
    }
  }
};

// Utility function to convert a hexadecimal string to ArrayBuffer
function hexToArrayBuffer(hex) {
  console.log(`🔄 Converting hexadecimal signature (${hex.length} characters) to ArrayBuffer`);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i/2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

// Fonction utilitaire pour ajouter les en-têtes anti-cache
function addNoCacheHeaders(headers = {}) {
  return {
    ...headers,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
}