#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Use prompt-sync for better handling of masked inputs
// You will need to install this module with: npm install prompt-sync
import promptSync from 'prompt-sync';
const prompt = promptSync({ sigint: true });

// Configuration
let SECRETS_WORKER_URL = 'https://taxicrm-microservices-secrets-manager.frederic-geens-consulting.workers.dev/';

// Function to check and update SECRETS_WORKER_URL
async function checkAndUpdateSecretsWorkerUrl() {
  return new Promise((resolve) => {
    if (!SECRETS_WORKER_URL) {
      console.log('⚠️ SECRETS_WORKER_URL is not defined.');
      
      // Use execSync for reliable input
      console.log('Please provide the secrets worker URL:');
      const userInput = execSync('read url; echo "$url"', { 
        stdio: ['inherit', 'pipe', 'inherit'],
        encoding: 'utf8' 
      }).trim();
      
      if (!userInput) {
        console.log('⚠️ URL cannot be empty.');
        process.exit(1);
      }
      
      // Display URL for confirmation
      console.log(`\nSubmitted URL: ${userInput}`);
      console.log('Do you confirm this URL? (y/n):');
      
      const confirmationInput = execSync('read conf; echo "$conf"', { 
        stdio: ['inherit', 'pipe', 'inherit'],
        encoding: 'utf8' 
      }).trim().toLowerCase();
      
      if (confirmationInput === 'y' || confirmationInput === 'yes') {
        SECRETS_WORKER_URL = userInput;
        
        // Update the file
        const filePath = path.resolve(process.argv[1]);
        let fileContent = fs.readFileSync(filePath, 'utf8');
        
        const newContent = fileContent.replace(
          /let SECRETS_WORKER_URL = .*?;|const SECRETS_WORKER_URL = .*?;/, 
          `let SECRETS_WORKER_URL = '${SECRETS_WORKER_URL}';`
        );
        
        fs.writeFileSync(filePath, newContent);
        console.log('✅ SECRETS_WORKER_URL has been updated in the file.');
        resolve();
      } else {
        console.log('❌ Operation cancelled. The script will stop.');
        process.exit(1);
      }
    } else {
      resolve();
    }
  });
}

// HMAC function (replaces missing import)
async function hmac(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}

// Function to mask password input with environment-specific handling
const getPasswordInput = (query) => {
  // Use a simpler approach for all environments to ensure consistent behavior
  return prompt(query, { echo: '*' });
};

// Enhanced password input function that works consistently across all environments
const getSecurePasswordInput = (query) => {
  // For all environments, use the same reliable method
  console.log(query);
  return prompt('', { echo: '*' });
};

// Get arguments
const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const environment = envIndex !== -1 && args.length > envIndex + 1 ? args[envIndex + 1] : 'development';

// Check and create if necessary the wrangler configuration for the environment
function checkWranglerConfig() {
  const wranglerPath = path.resolve(process.cwd(), 'wrangler.toml');
  
  if (!fs.existsSync(wranglerPath)) {
    console.warn('⚠️ wrangler.toml file not found. Make sure you are in the project directory.');
    return false;
  }
  
  // If the environment is "development", it's the default environment, so no need to check
  if (environment === 'development') {
    return true;
  }
  
  let wranglerContent = fs.readFileSync(wranglerPath, 'utf8');
  
  // Check if the environment is configured (only for non-development environments)
  const envSection = `[env.${environment}]`;
  if (!wranglerContent.includes(envSection)) {
    console.log(`ℹ️ The environment "${environment}" is not configured in wrangler.toml. Creating automatically...`);
    
    // Add the environment section at the end of the file
    wranglerContent += `\n\n${envSection}\n`;
    
    // Also add the vars section if it doesn't already exist
    const varsSection = `[env.${environment}.vars]`;
    if (!wranglerContent.includes(varsSection)) {
      wranglerContent += `${varsSection}\n`;
    }
    
    try {
      fs.writeFileSync(wranglerPath, wranglerContent);
      console.log(`✅ Section [env.${environment}] added to wrangler.toml`);
    } catch (error) {
      console.error(`❌ Error updating wrangler.toml: ${error.message}`);
      return false;
    }
  }
  
  return true;
}

// Function to update variables in wrangler.toml
function updateWranglerVars(variables, env) {
  const wranglerPath = path.resolve(process.cwd(), 'wrangler.toml');
  
  if (!fs.existsSync(wranglerPath)) {
    console.warn('⚠️ wrangler.toml file not found. Unable to update variables.');
    return false;
  }
  
  let wranglerContent = fs.readFileSync(wranglerPath, 'utf8');
  
  // Determine the section to modify
  const sectionName = env === 'development' ? 'vars' : `env.${env}.vars`;
  const sectionHeader = env === 'development' ? '[vars]' : `[env.${env}.vars]`;
  
  // Extract existing variables with their comments
  const existingVarsRegex = env === 'development' 
    ? /(\[vars\](?:[\s\S]*?)(?=\n\[|\n$))/
    : new RegExp(`(\\[env\\.${env}\\.vars\\](?:[\\s\\S]*?)(?=\\n\\[|\\n$))`);
  
  let existingVarsSection = '';
  let existingVars = {};
  const existingVarsMatch = wranglerContent.match(existingVarsRegex);
  
  if (existingVarsMatch) {
    existingVarsSection = existingVarsMatch[1];
    
    // Extract lines from the section
    const lines = existingVarsSection.split('\n').slice(1); // Ignore the header line
    
    // Parse each line to extract variables and preserve comments
    let currentComments = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // If it's an empty line, keep it
      if (trimmedLine === '') {
        currentComments.push('');
        continue;
      }
      
      // If it's a comment, store it
      if (trimmedLine.startsWith('#')) {
        currentComments.push(line);
        continue;
      }
      
      // If it's a variable
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        existingVars[key] = {
          value: value.trim(),
          comments: [...currentComments], // Copy associated comments
          indentation: '' // Remove indentation for all variables
        };
        currentComments = []; // Reset comments for the next variable
      }
    }
  }
  
  // Merge with new variables
  const updatedVars = { ...existingVars };
  const updatedKeys = [];
  
  for (const [key, value] of Object.entries(variables)) {
    // Format the value based on its type
    let formattedValue;
    
    if (Array.isArray(value)) {
      // Correction ici pour gérer correctement les tableaux
      formattedValue = `[ ${value.map(item => {
        if (typeof item === 'string') {
          return `"${item.replace(/"/g, '\\"')}"`;
        } else {
          return item;
        }
      }).join(', ')} ]`;
    } else if (typeof value === 'object' && value !== null) {
      try {
        // Vérifier si c'est un tableau déguisé en objet (avec des clés numériques)
        const keys = Object.keys(value);
        const isNumericArray = keys.length > 0 && 
                              keys.every(k => !isNaN(parseInt(k))) && 
                              keys.every(k => parseInt(k).toString() === k);
        
        if (isNumericArray) {
          // C'est un tableau avec des indices numériques, le convertir en tableau
          const arrayValues = [];
          for (let i = 0; i < keys.length; i++) {
            if (value[i] !== undefined) {
              arrayValues.push(value[i]);
            }
          }
          
          formattedValue = `[ ${arrayValues.map(item => {
            if (typeof item === 'string') {
              return `"${item.replace(/"/g, '\\"')}"`;
            } else {
              return item;
            }
          }).join(', ')} ]`;
        } else {
          // C'est un objet normal
          const jsonEntries = Object.entries(value).map(([k, v]) => {
            if (typeof v === 'string') {
              return `${k} = "${v.replace(/"/g, '\\"')}"`;
            } else {
              return `${k} = ${v}`;
            }
          }).join(', ');
          formattedValue = `{ ${jsonEntries} }`;
        }
      } catch (error) {
        formattedValue = `"${JSON.stringify(value).replace(/"/g, '\\"')}"`;
      }
    } else if (typeof value === 'string') {
      formattedValue = `"${value.replace(/"/g, '\\"')}"`;
    } else {
      formattedValue = value;
    }
    
    // If the variable already exists, update its value but keep its comments
    if (updatedVars[key]) {
      updatedVars[key].value = formattedValue;
    } else {
      // Otherwise, create a new entry without comments and without indentation
      updatedVars[key] = {
        value: formattedValue,
        comments: [],
        indentation: '' // No indentation for new variables
      };
    }
    
    updatedKeys.push(key);
  }
  
  // Build the new section
  let newSection = `${sectionHeader}\n`;
  
  // Add variables with their comments
  for (const [key, details] of Object.entries(updatedVars)) {
    // Add associated comments
    for (const comment of details.comments) {
      newSection += `${comment}\n`;
    }
    
    // Add the variable without indentation
    newSection += `${key} = ${details.value}\n`;
  }
  
  // Update the file content
  if (existingVarsMatch) {
    // Replace the existing section
    wranglerContent = wranglerContent.replace(existingVarsRegex, newSection);
  } else {
    // Add the new section at the end
    wranglerContent += `\n${newSection}`;
  }
  
  // Write the updated content
  try {
    fs.accessSync(wranglerPath, fs.constants.W_OK);
    fs.writeFileSync(wranglerPath, wranglerContent);
    console.log(`✅ Variables updated in wrangler.toml for the ${env} environment`);
    console.log(`   ⚠️ Note: If wrangler.toml is currently open in your editor, you may need to reload it to see the changes.`);
    
    // Display updated variables
    if (updatedKeys.length > 0) {
      console.log(`   Updated variables:`);
      for (const key of updatedKeys) {
        console.log(`   - ${key}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error: No write permission for ${wranglerPath}`);
    return false;
  }
}

// Function to write variables to a .dev.vars file (only for the development environment)
function writeDevVars(variables) {
  const devVarsPath = path.resolve(process.cwd(), '.dev.vars');
  let content = '';
  
  console.log('   Creating/updating .dev.vars file for local development');
  
  for (const [key, value] of Object.entries(variables)) {
    // Format the value based on its type
    let formattedValue;
    if (typeof value === 'object') {
      formattedValue = JSON.stringify(value);
    } else {
      formattedValue = String(value);
    }
    
    content += `${key}=${formattedValue}\n`;
  }
  
  try {
    fs.accessSync(devVarsPath, fs.constants.W_OK);
    fs.writeFileSync(devVarsPath, content);
    console.log(`✅ Variables written to .dev.vars file`);
    console.log(`   ⚠️ Note: If .dev.vars is currently open in your editor, you may need to reload it to see the changes.`);
    return true;
  } catch (error) {
    console.error(`❌ Error writing to .dev.vars: ${error.message}`);
    return false;
  }
}

// Function to handle password input with retry capability
async function getPasswordWithRetry(maxAttempts = 3) {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    // Request password using the enhanced method
    const passwordPrompt = 'Enter the Microservices-secret-manager\'s Master Password to access secrets:';
    const password = await getSecurePasswordInput(passwordPrompt);
    
    if (!password || password.length < 8) {
      console.error(`❌ Invalid or too short password (minimum 8 characters required)`);
      
      if (attempts < maxAttempts) {
        console.log(`Please try again (attempt ${attempts}/${maxAttempts})...`);
        continue;
      } else {
        throw new Error('Maximum password attempts reached');
      }
    }
    
    try {
      // Generate a nonce to prevent replay attacks
      const nonce = crypto.randomBytes(16).toString('hex');
      const timestamp = Date.now().toString();
      
      // Add a cache-busting parameter
      const cacheBuster = Math.random().toString(36).substring(2, 15);
    
      // Create an HMAC signature to authenticate the request
      const message = `${nonce}:${timestamp}:${environment}`;
      const signature = await hmac(password, message);
    
      console.log(`\n📡 Retrieving configurations from the secrets microservice...`);
      
      // Add cache buster to URL
      const url = `${SECRETS_WORKER_URL}?env=${environment}&_cb=${cacheBuster}`;
      console.log(`   Request URL: ${url}`);
    
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${signature}`,
          'X-Request-Nonce': nonce,
          'X-Request-Timestamp': timestamp,
          'Cache-Control': 'no-cache, no-store'
        }
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Handle rate limiting with more detailed information
          const retryAfter = response.headers.get('Retry-After') || '3600';
          const waitSeconds = parseInt(retryAfter, 10);
          const waitMinutes = Math.ceil(waitSeconds / 60);
          
          const responseText = await response.text();
          console.error(`\n❌ Rate limit details:`);
          console.error(`   Status: ${response.status}`);
          console.error(`   Headers: ${JSON.stringify(Object.fromEntries([...response.headers]))}`);
          console.error(`   Response: ${responseText}`);
          console.error(`   Client IP may be rate limited in the KV store`);
          console.error(`   KV key format: ratelimit:<your-ip-address>`);
          
          throw new Error(`Rate limit exceeded. Too many failed attempts. Please try again in ${waitMinutes} minute(s) (${waitSeconds} seconds).`);
        }
        
        if (response.status === 401) {
          console.error('❌ Incorrect password or unauthorized');
          
          if (attempts < maxAttempts) {
            console.log(`Please try again (attempt ${attempts}/${maxAttempts})...`);
            continue;
          } else {
            throw new Error('Maximum password attempts reached');
          }
        }
        
        const responseText = await response.text();
        throw new Error(`HTTP Error ${response.status}: ${responseText}`);
      }

      // If we get here, the password was correct
      const data = await response.json();
      return { password, data };
      
    } catch (error) {
      if (error.message.includes('Maximum password attempts') || 
          error.message.includes('Rate limit exceeded')) {
        throw error;
      }
      
      if (!error.message.includes('Incorrect password')) {
        throw error;
      }
      
      // For password errors, we continue the loop to retry
      if (attempts >= maxAttempts) {
        throw new Error('Maximum password attempts reached');
      }
    }
  }
  
  throw new Error('Maximum password attempts reached');
}

async function fetchAndApplySecrets() {
  try {
    console.log(`\n🔑 Configuration for the ${environment} environment`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Get password with retry capability and retrieve data
    const { data } = await getPasswordWithRetry(3);
    
    // Verify the structure of received data
    console.log('\n🔍 Analyzing data received from the microservice...');
    
    // Ensure that variables and secrets properties exist
    const variables = data.variables || {};
    const secrets = data.secrets || {};
    
    // Display information about received data for debugging
    console.log(`   Received data: ${Object.keys(data).join(', ')}`);
    console.log(`   Variables: ${Object.keys(variables).length}`);
    console.log(`   Secrets: ${Object.keys(secrets).length}`);
    
    // If a key is not in the correct format, ask the user to categorize it
    const unclassifiedKeys = Object.keys(data).filter(key => key !== 'variables' && key !== 'secrets');
    const manualClassification = {};
    
    if (unclassifiedKeys.length > 0) {
      console.log('\n⚠️ Some data is not properly classified as variables or secrets.');
      console.log('Please indicate for each item if it is a variable (v) or a secret (s):');
      
      for (const key of unclassifiedKeys) {
        const value = data[key];
        const isObject = typeof value === 'object' && value !== null;
        
        console.log(`\nKey: ${key}`);
        console.log(`Value: ${isObject ? 'Complex object' : value}`);
        
        const classification = prompt('Is this a variable (v) or a secret (s)? ').toLowerCase();
        
        if (classification === 'v' || classification === 'variable') {
          manualClassification[key] = { type: 'variable', value };
        } else if (classification === 's' || classification === 'secret') {
          manualClassification[key] = { type: 'secret', value };
        } else {
          console.log(`⚠️ Unrecognized classification, the item will be ignored.`);
        }
      }
      
      // Add manually classified items to variables or secrets
      for (const [key, { type, value }] of Object.entries(manualClassification)) {
        if (type === 'variable') {
          variables[key] = value;
        } else if (type === 'secret') {
          secrets[key] = value;
        }
      }
      
      console.log('\n✅ Manual classification completed.');
      console.log(`   Variables after classification: ${Object.keys(variables).length}`);
      console.log(`   Secrets after classification: ${Object.keys(secrets).length}`);
    }

    // Arrays to store results
    const successfulVariables = [];
    const failedVariables = [];
    const successfulSecrets = [];
    const failedSecrets = [];

    // Check wrangler configuration
    const isWranglerConfigValid = checkWranglerConfig();

    // Apply non-sensitive variables
    console.log('\n📝 Applying non-sensitive variables...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (Object.keys(variables).length === 0) {
      console.log('   No variables found for this environment.');
    } else {
      // Update wrangler.toml with variables
      const wranglerSuccess = updateWranglerVars(variables, environment);
      
      // For the development environment only, also write to .dev.vars
      if (environment === 'development') {
        console.log('   Updating .dev.vars file for the local development environment');
        const devVarsSuccess = writeDevVars(variables);
        if (devVarsSuccess) {
          for (const key of Object.keys(variables)) {
            if (!successfulVariables.includes(key)) {
              successfulVariables.push(key);
            }
          }
        }
      }
      
      if (wranglerSuccess) {
        for (const key of Object.keys(variables)) {
          if (!successfulVariables.includes(key)) {
            successfulVariables.push(key);
          }
        }
      } else {
        for (const key of Object.keys(variables)) {
          if (!failedVariables.includes(key)) {
            failedVariables.push(key);
          }
        }
      }
    }

    // Apply secrets
    console.log('\n🔒 Applying secrets...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (Object.keys(secrets).length === 0) {
      console.log('   No secrets found for this environment.');
    } else if (isWranglerConfigValid) {
      for (const [key, value] of Object.entries(secrets)) {
        try {
          // For the development environment, don't use the --env flag
          const command = environment === 'development' 
            ? `npx wrangler secret put ${key}` 
            : `npx wrangler secret put ${key} --env ${environment}`;
          
          execSync(command, {
            input: value,
            stdio: ['pipe', 'inherit', 'inherit']
          });
          console.log(`✅ Secret ${key} configured`);
          successfulSecrets.push(key);
        } catch (error) {
          console.error(`❌ Error configuring secret ${key}`);
          failedSecrets.push(key);
        }
      }
    } else {
      console.log('⚠️ Invalid wrangler configuration, secrets will not be applied.');
      for (const key of Object.keys(secrets)) {
        failedSecrets.push(key);
      }
    }

    // Redeploy the worker to apply environment variables
    console.log('\n🚀 Redeploying worker to apply environment variables...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      const deployCommand = environment === 'development' 
        ? 'npx wrangler deploy'
        : `npx wrangler deploy --env ${environment}`;
      
      console.log(`Executing command: ${deployCommand}`);
      execSync(deployCommand, { stdio: 'inherit' });
      console.log('✅ Worker successfully redeployed');
    } catch (error) {
      console.error(`❌ Error redeploying worker: ${error.message}`);
      console.log('⚠️ Environment variables might not be applied');
    }

    // Display summary
    console.log('\n📊 Configuration Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📝 Configured variables (${successfulVariables.length}/${Object.keys(variables).length}):`);
    if (successfulVariables.length > 0) {
      successfulVariables.forEach(key => console.log(`   - ${key}`));
    } else {
      console.log('   No variables configured.');
    }
    
    if (failedVariables.length > 0) {
      console.log(`\n⚠️ Failed variables (${failedVariables.length}):`);
      failedVariables.forEach(key => console.log(`   - ${key}`));
    }
    
    console.log(`\n🔒 Configured secrets (${successfulSecrets.length}/${Object.keys(secrets).length}):`);
    if (successfulSecrets.length > 0) {
      successfulSecrets.forEach(key => console.log(`   - ${key}`));
    } else {
      console.log('   No secrets configured.');
    }

    if (failedSecrets.length > 0) {
      console.log(`\n⚠️ Failed secrets (${failedSecrets.length}):`);
      failedSecrets.forEach(key => console.log(`   - ${key}`));
    }

    // Display final status
    const totalSuccess = successfulVariables.length + successfulSecrets.length;
    const totalFailed = failedVariables.length + failedSecrets.length;
    const totalItems = Object.keys(variables).length + Object.keys(secrets).length;

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (totalFailed === 0) {
      console.log(`🎉 Configuration completed successfully! (${totalSuccess}/${totalItems} elements configured)`);
    } else {
      console.log(`⚠️ Configuration completed with warnings. (${totalSuccess}/${totalItems} elements configured, ${totalFailed} failures)`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Function to deploy the worker before configuring secrets
async function deployWorkerBeforeSecrets() {
  console.log(`\n🚀 DEPLOYING THE WORKER 🚀`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Before configuring secrets, the worker must be deployed for the "${environment}" environment.`);
  
  const deployCommand = environment === 'development' 
    ? 'npx wrangler deploy'
    : `npx wrangler deploy --env ${environment}`;
  
  console.log(`\nCommand that will be executed: ${deployCommand}`);
  
  // Ask for user confirmation
  const confirmation = prompt('Do you want to deploy the worker now? (y/n): ').toLowerCase();
  
  if (confirmation !== 'y' && confirmation !== 'yes') {
    console.log(`\n❌ Deployment cancelled. Secrets will not be configured.`);
    return false;
  }
  
  console.log(`\n📡 Deploying the worker...`);
  
  try {
    // Execute the deployment command
    execSync(deployCommand, { stdio: 'inherit' });
    
    console.log(`\n✅ Worker successfully deployed for the "${environment}" environment.`);
    return true;
  } catch (error) {
    console.error(`\n❌ Error deploying the worker: ${error.message}`);
    
    // Ask if the user wants to continue despite deployment failure
    const continueAnyway = prompt('Do you want to continue with secrets configuration despite the deployment failure? (y/n): ').toLowerCase();
    return continueAnyway === 'y' || continueAnyway === 'yes';
  }
}

// Main function
async function main() {
  try {
    await checkAndUpdateSecretsWorkerUrl();
    
    // Deploy the worker before configuring secrets
    const canContinue = await deployWorkerBeforeSecrets();
    if (!canContinue) {
      console.log('❌ Operation cancelled. Please deploy the worker before configuring secrets.');
      process.exit(1);
    }
    
    await fetchAndApplySecrets();
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main();
