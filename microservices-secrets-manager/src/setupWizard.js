// src/setupWizard.js
import inquirer from 'inquirer';
import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Modifier la fonction parseWranglerToml pour gérer correctement les tableaux
function parseWranglerToml() {
  const wranglerTomlPath = path.join(process.cwd(), 'wrangler.toml');
  let config = {
    name: "microservices-secrets-manager", // Valeur par défaut
    main: "src/index.js",
    compatibility_date: "2025-02-14",
    compatibility_flags: ["nodejs_compat"],
    vars: {}
  };
  
  if (fs.existsSync(wranglerTomlPath)) {
    try {
      const content = fs.readFileSync(wranglerTomlPath, 'utf8');
      
      // Extraire le nom du projet
      const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
      if (nameMatch && nameMatch[1]) {
        config.name = nameMatch[1];
      }
      
      // Extraire le fichier principal
      const mainMatch = content.match(/main\s*=\s*"([^"]+)"/);
      if (mainMatch && mainMatch[1]) {
        config.main = mainMatch[1];
      }
      
      // Extraire la date de compatibilité
      const compatDateMatch = content.match(/compatibility_date\s*=\s*"([^"]+)"/);
      if (compatDateMatch && compatDateMatch[1]) {
        config.compatibility_date = compatDateMatch[1];
      }
      
      // Extraire les drapeaux de compatibilité
      const compatFlagsMatch = content.match(/compatibility_flags\s*=\s*\[(.*?)\]/s);
      if (compatFlagsMatch && compatFlagsMatch[1]) {
        config.compatibility_flags = compatFlagsMatch[1]
          .split(',')
          .map(flag => flag.trim().replace(/"/g, ''))
          .filter(flag => flag);
      }
      
      // Extraire l'ID de compte
      const accountIdMatch = content.match(/account_id\s*=\s*"([^"]+)"/);
      if (accountIdMatch && accountIdMatch[1]) {
        config.account_id = accountIdMatch[1];
      }
      
      // Extraire la configuration KV Namespace
      const kvNamespaceMatch = content.match(/\[\[kv_namespaces\]\]\s*binding\s*=\s*"([^"]+)"\s*id\s*=\s*"([^"]+)"/);
      if (kvNamespaceMatch && kvNamespaceMatch[1] && kvNamespaceMatch[2]) {
        config.kv_namespace = {
          binding: kvNamespaceMatch[1],
          id: kvNamespaceMatch[2]
        };
      }
      
      // Extraire les variables d'environnement existantes
      // Préserver le contenu original de la section [vars]
      const varsMatch = content.match(/\[vars\]([\s\S]*?)(\[\[.*?\]\]|\[.*?\](?!\s*=)|$)/);
      if (varsMatch && varsMatch[1]) {
        config.varsRaw = varsMatch[1];
      }
      
      console.log(chalk.green('✓ Configuration existante lue avec succès.'));
    } catch (error) {
      console.log(chalk.yellow(`Erreur lors de la lecture de wrangler.toml: ${error.message}`));
    }
  } else {
    console.log(chalk.yellow('Le fichier wrangler.toml n\'existe pas encore, utilisation des valeurs par défaut.'));
  }
  
  return config;
}

// Modifier la fonction generateWranglerToml pour préserver le format des variables
function generateWranglerToml(config) {
  let content = `name = "${config.name}"
main = "${config.main}"
compatibility_date = "${config.compatibility_date}"
compatibility_flags = [${config.compatibility_flags.map(flag => `"${flag}"`).join(', ')}]
`;

  // Ajouter l'ID de compte s'il existe
  if (config.account_id) {
    content += `\n# Account ID (IMPORTANT - DO NOT DELETE)
account_id = "${config.account_id}"\n`;
  }
  
  // Ajouter la configuration KV Namespace si elle existe
  if (config.kv_namespace) {
    content += `\n# KV Namespace binding for rate limiting
[[kv_namespaces]]
binding = "${config.kv_namespace.binding}"
id = "${config.kv_namespace.id}"\n`;
  }
  
  // Ajouter les variables d'environnement en préservant le format original
  if (config.varsRaw) {
    content += `\n# Environment variables (non-sensitive)
[vars]${config.varsRaw}`;
  } else if (Object.keys(config.vars || {}).length > 0) {
    content += `\n# Environment variables (non-sensitive)
[vars]\n`;
    
    for (const [key, value] of Object.entries(config.vars)) {
      content += `${key} = "${value}"\n`;
    }
  }
  
  return content;
}

// Modifier la fonction updateWranglerToml pour préserver les variables existantes
function updateWranglerToml(updates) {
  const wranglerTomlPath = path.join(process.cwd(), 'wrangler.toml');
  
  // Lire la configuration existante
  const existingConfig = parseWranglerToml();
  
  // Fusionner avec les mises à jour
  const updatedConfig = {
    ...existingConfig,
    ...updates
  };
  
  // Si nous avons des mises à jour de variables et que nous avons déjà des variables existantes
  if (updates.vars && existingConfig.varsRaw) {
    // Nous allons mettre à jour les variables spécifiques dans le contenu brut
    let varsRaw = existingConfig.varsRaw;
    
    for (const [key, value] of Object.entries(updates.vars)) {
      // Vérifier si la variable existe déjà
      const varRegex = new RegExp(`(^|\\n)\\s*${key}\\s*=\\s*"[^"]*"`, 'g');
      if (varRegex.test(varsRaw)) {
        // Remplacer la valeur existante
        varsRaw = varsRaw.replace(varRegex, `$1${key} = "${value}"`);
      } else {
        // Ajouter la nouvelle variable
        varsRaw += `\n${key} = "${value}"`;
      }
    }
    
    updatedConfig.varsRaw = varsRaw;
  }
  
  // Générer le nouveau contenu
  const tomlContent = generateWranglerToml(updatedConfig);
  
  // Écrire le fichier
  try {
    fs.writeFileSync(wranglerTomlPath, tomlContent, 'utf8');
    console.log(chalk.green('✓ Fichier wrangler.toml mis à jour avec succès.'));
    return true;
  } catch (error) {
    console.log(chalk.red(`❌ Erreur lors de la mise à jour du fichier wrangler.toml: ${error.message}`));
    return false;
  }
}

async function runSetupWizard() {
  console.log(chalk.blue('Welcome to the Microservices Secrets Manager Setup Wizard!'));
  console.log(chalk.blue('This wizard will guide you through setting up your centralized secrets management system.'));
  console.log('');
  
  // Step 1: Verify Cloudflare account
  const { hasCloudflareAccount } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'hasCloudflareAccount',
      message: 'Do you already have a Cloudflare account?',
      default: false
    }
  ]);
  
  if (!hasCloudflareAccount) {
    console.log(chalk.yellow('Please create a Cloudflare account at https://dash.cloudflare.com/sign-up'));
    console.log('Once you have created your account, come back to this wizard.');
    
    const { ready } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'ready',
        message: 'Have you created your Cloudflare account?',
        default: false
      }
    ]);
    
    if (!ready) {
      console.log(chalk.red('Please create a Cloudflare account before continuing.'));
      return;
    }
  }
  
  // Step 2: Check if Wrangler is installed
  console.log(chalk.blue('\nChecking if Wrangler CLI is installed...'));
  
  let wranglerInstalled = false;
  try {
    execSync('wrangler --version', { stdio: 'ignore' });
    wranglerInstalled = true;
    console.log(chalk.green('✓ Wrangler CLI is already installed.'));
  } catch (error) {
    console.log(chalk.yellow('Wrangler CLI is not installed.'));
  }
  
  if (!wranglerInstalled) {
    const { installWrangler } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'installWrangler',
        message: 'Would you like to install Wrangler CLI now?',
        default: true
      }
    ]);
    
    if (installWrangler) {
      console.log(chalk.blue('Installing Wrangler CLI...'));
      try {
        execSync('npm install -g wrangler', { stdio: 'inherit' });
        console.log(chalk.green('✓ Wrangler CLI installed successfully.'));
      } catch (error) {
        console.log(chalk.red('Failed to install Wrangler CLI. Please install it manually with: npm install -g wrangler'));
        return;
      }
    } else {
      console.log(chalk.yellow('Please install Wrangler CLI manually before continuing.'));
      return;
    }
  }
  
  // Step 3: Login to Cloudflare
  console.log(chalk.blue('\nChecking Cloudflare authentication...'));
  
  let isLoggedIn = false;
  try {
    const whoamiOutput = execSync('wrangler whoami', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    if (whoamiOutput.includes('You are logged in')) {
      isLoggedIn = true;
      console.log(chalk.green('✓ You are already logged in to Cloudflare.'));
    }
  } catch (error) {
    console.log(chalk.yellow('You are not logged in to Cloudflare.'));
  }
  
  if (!isLoggedIn) {
    const { login } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'login',
        message: 'Would you like to log in to Cloudflare now?',
        default: true
      }
    ]);
    
    if (login) {
      console.log(chalk.blue('Logging in to Cloudflare...'));
      try {
        execSync('wrangler login', { stdio: 'inherit' });
        console.log(chalk.green('✓ Successfully logged in to Cloudflare.'));
      } catch (error) {
        console.log(chalk.red('Failed to log in to Cloudflare. Please try again later.'));
        return;
      }
    } else {
      console.log(chalk.yellow('You need to be logged in to Cloudflare to continue.'));
      return;
    }
  }
  
  // Step 4: Get Account ID
  console.log(chalk.blue('\nRetrieving your Cloudflare Account ID...'));
  
  let accountId = '';
  let foundAutomatically = false;
  let needToRelogin = false;

  // Function to handle logout and login
  async function reloginToCloudflare() {
    console.log(chalk.blue('Logging out from Cloudflare...'));
    try {
      execSync('wrangler logout', { stdio: 'inherit' });
      console.log(chalk.green('✓ Logged out from Cloudflare.'));
      
      console.log(chalk.blue('Logging back in to Cloudflare...'));
      execSync('wrangler login', { stdio: 'inherit' });
      console.log(chalk.green('✓ Logged back in to Cloudflare.'));
      
      // Add a small delay to allow Cloudflare to update authentication information
      console.log(chalk.blue('Waiting for authentication information to update...'));
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      return true; // Successful reconnection
    } catch (error) {
      console.log(chalk.red(`Error during reconnection: ${error.message}`));
      return false; // Failed reconnection
    }
  }

  async function retrieveAccountId() {
    try {
      const whoamiOutput = execSync('wrangler whoami', { encoding: 'utf8' });
      
      // New more robust regular expression to extract Account ID
      // This regex looks for a 32-character hexadecimal ID in a line containing "Account ID"
      const accountIdMatch = whoamiOutput.match(/Account ID\s*│\s*([a-f0-9]{32})/i);
      
      // Fallback: search for any 32-character hexadecimal sequence
      const fallbackMatch = !accountIdMatch && whoamiOutput.match(/([a-f0-9]{32})/);
      
      if (accountIdMatch && accountIdMatch[1]) {
        accountId = accountIdMatch[1];
        foundAutomatically = true;
        console.log(chalk.green(`✓ Account ID found: ${accountId}`));
        
        // Ask for user confirmation
        const { confirmAccountId } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmAccountId',
            message: `Do you want to use this Account ID: ${accountId}?`,
            default: true
          }
        ]);
        
        if (confirmAccountId) {
          // Remplacer ce bloc de code par :
          try {
            const updateSuccess = updateWranglerToml({
              account_id: accountId
            });
            
            if (updateSuccess) {
              console.log(chalk.green(`✓ Fichier wrangler.toml mis à jour avec l'ID de compte: ${accountId}`));
            } else {
              throw new Error("La mise à jour du fichier wrangler.toml a échoué");
            }
          } catch (error) {
            console.error(chalk.red(`❌ Erreur lors de la mise à jour du fichier wrangler.toml: ${error.message}`));
            console.log(chalk.yellow(`⚠️ Veuillez mettre à jour manuellement le fichier wrangler.toml avec votre ID de compte: ${accountId}`));
          }
        } else {
          // Offer to reconnect
          const { wantToRelogin } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'wantToRelogin',
              message: 'Do you want to log out and log back in to Cloudflare?',
              default: true
            }
          ]);
          
          if (wantToRelogin) {
            const reloginSuccess = await reloginToCloudflare();
            if (reloginSuccess) {
              // Explicitly verify that we are properly connected
              try {
                const whoamiOutput = execSync('wrangler whoami', { encoding: 'utf8' });
                console.log(chalk.green('Connection verification successful:'));
                console.log(chalk.cyan(whoamiOutput));
                console.log(chalk.blue('Attempting to retrieve new Account ID...'));
                return await retrieveAccountId(); // Recursive call to try again
              } catch (error) {
                console.log(chalk.red(`Error verifying connection: ${error.message}`));
              }
            }
          }
          
          // Ask manually if user doesn't want to use suggested ID or if reconnection failed
          const { manualAccountId } = await inquirer.prompt([
            {
              type: 'input',
              name: 'manualAccountId',
              message: 'Please enter your Cloudflare Account ID:',
              validate: (input) => input.trim() !== '' ? true : 'Account ID is required'
            }
          ]);
          
          accountId = manualAccountId.trim();
        }
      } else if (fallbackMatch && fallbackMatch[1]) {
        accountId = fallbackMatch[1];
        foundAutomatically = true;
        console.log(chalk.green(`✓ Account ID found (alternative method): ${accountId}`));
        
        // Ask for user confirmation
        const { confirmAccountId } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmAccountId',
            message: `Do you want to use this Account ID: ${accountId}?`,
            default: true
          }
        ]);
        
        if (confirmAccountId) {
          // Remplacer ce bloc de code par :
          try {
            const updateSuccess = updateWranglerToml({
              account_id: accountId
            });
            
            if (updateSuccess) {
              console.log(chalk.green(`✓ Fichier wrangler.toml mis à jour avec l'ID de compte: ${accountId}`));
            } else {
              throw new Error("La mise à jour du fichier wrangler.toml a échoué");
            }
          } catch (error) {
            console.error(chalk.red(`❌ Erreur lors de la mise à jour du fichier wrangler.toml: ${error.message}`));
            console.log(chalk.yellow(`⚠️ Veuillez mettre à jour manuellement le fichier wrangler.toml avec votre ID de compte: ${accountId}`));
          }
        } else {
          // Offer to reconnect
          const { wantToRelogin } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'wantToRelogin',
              message: 'Do you want to log out and log back in to Cloudflare?',
              default: true
            }
          ]);
          
          if (wantToRelogin) {
            const reloginSuccess = await reloginToCloudflare();
            if (reloginSuccess) {
              // Explicitly verify that we are properly connected
              try {
                const whoamiOutput = execSync('wrangler whoami', { encoding: 'utf8' });
                console.log(chalk.green('Connection verification successful:'));
                console.log(chalk.cyan(whoamiOutput));
                console.log(chalk.blue('Attempting to retrieve new Account ID...'));
                return await retrieveAccountId(); // Recursive call to try again
              } catch (error) {
                console.log(chalk.red(`Error verifying connection: ${error.message}`));
              }
            }
          }
          
          // Ask manually if user doesn't want to use suggested ID or if reconnection failed
          const { manualAccountId } = await inquirer.prompt([
            {
              type: 'input',
              name: 'manualAccountId',
              message: 'Please enter your Cloudflare Account ID:',
              validate: (input) => input.trim() !== '' ? true : 'Account ID is required'
            }
          ]);
          
          accountId = manualAccountId.trim();
        }
      }
    } catch (error) {
      console.log(chalk.red('Unable to retrieve Account ID automatically.'));
    }
    
    if (!foundAutomatically) {
      console.log(chalk.yellow('\nHere is how you can find your Cloudflare Account ID:'));
      console.log(chalk.yellow('1. Log in to your Cloudflare dashboard: https://dash.cloudflare.com'));
      console.log(chalk.yellow('2. Click on "Workers & Pages" in the left menu'));
      console.log(chalk.yellow('3. Your Account ID is displayed in the right sidebar'));
      console.log(chalk.yellow('4. You can also get it by running "wrangler whoami" in a separate terminal\n'));
      
      // Try to run wrangler whoami and display output to help the user
      try {
        console.log(chalk.blue('Trying to run "wrangler whoami" for you:'));
        const whoamiOutput = execSync('wrangler whoami', { encoding: 'utf8' });
        console.log(chalk.cyan(whoamiOutput));
        
        // Try to extract ID again for suggestion
        const accountIdMatch = whoamiOutput.match(/Account ID\s*│\s*([a-f0-9]{32})/i) || whoamiOutput.match(/([a-f0-9]{32})/);
        if (accountIdMatch && accountIdMatch[1]) {
          const suggestedId = accountIdMatch[1];
          
          const { useExtractedId } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'useExtractedId',
              message: `Do you want to use the extracted Account ID: ${suggestedId}?`,
              default: true
            }
          ]);
          
          if (useExtractedId) {
            accountId = suggestedId;
            console.log(chalk.green(`✓ Account ID set: ${accountId}`));

            // Remplacer ce bloc de code par :
            try {
              const updateSuccess = updateWranglerToml({
                account_id: accountId
              });
              
              if (updateSuccess) {
                console.log(chalk.green(`✓ Fichier wrangler.toml mis à jour avec l'ID de compte: ${accountId}`));
              } else {
                throw new Error("La mise à jour du fichier wrangler.toml a échoué");
              }
            } catch (error) {
              console.error(chalk.red(`❌ Erreur lors de la mise à jour du fichier wrangler.toml: ${error.message}`));
              console.log(chalk.yellow(`⚠️ Veuillez mettre à jour manuellement le fichier wrangler.toml avec votre ID de compte: ${accountId}`));
            }
          } else {
            // Offer to reconnect
            const { wantToRelogin } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'wantToRelogin',
                message: 'Do you want to log out and log back in to Cloudflare?',
                default: true
              }
            ]);
            
            if (wantToRelogin) {
              const reloginSuccess = await reloginToCloudflare();
              if (reloginSuccess) {
                // Explicitly verify that we are properly connected
                try {
                  const whoamiOutput = execSync('wrangler whoami', { encoding: 'utf8' });
                  console.log(chalk.green('Connection verification successful:'));
                  console.log(chalk.cyan(whoamiOutput));
                  console.log(chalk.blue('Attempting to retrieve new Account ID...'));
                  return await retrieveAccountId(); // Recursive call to try again
                } catch (error) {
                  console.log(chalk.red(`Error verifying connection: ${error.message}`));
                }
              }
            }
            
            // Ask manually if user doesn't want to use suggested ID or if reconnection failed
            const { manualAccountId } = await inquirer.prompt([
              {
                type: 'input',
                name: 'manualAccountId',
                message: 'Please enter your Cloudflare Account ID:',
                validate: (input) => input.trim() !== '' ? true : 'Account ID is required'
              }
            ]);
            
            accountId = manualAccountId.trim();
          }
        }
      } catch (error) {
        // If execution fails, ask manually
        const { manualAccountId } = await inquirer.prompt([
          {
            type: 'input',
            name: 'manualAccountId',
            message: 'Please enter your Cloudflare Account ID:',
            validate: (input) => input.trim() !== '' ? true : 'Account ID is required'
          }
        ]);
        
        accountId = manualAccountId.trim();
      }
    }
    
    return accountId;
  }

  // Call the function to retrieve the Account ID
  accountId = await retrieveAccountId();
  
  // Step 5: Create KV Namespace
  console.log(chalk.blue('\nSetting up KV Namespace for rate limiting...'));

  // Function to validate improved
  function isValidBindingName(name) {
    // Rules for valid binding names:
    // - Must start with a letter
    // - Can only contain letters, numbers, hyphens, and underscores
    const validPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;
    
    // Check if name starts with a letter
    if (!/^[A-Za-z]/.test(name)) {
      return { valid: false, message: 'Variable name must start with a letter' };
    }
    
    // Check if name contains only allowed characters
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
      return { valid: false, message: 'Variable name can only contain letters, numbers, underscores, and hyphens' };
    }
    
    return { valid: true };
  }

  let kvNamespaceName = 'USER_RATE_LIMIT_KV';

  // Validate the KV Namespace name
  if (!isValidBindingName(kvNamespaceName)) {
    console.log(chalk.yellow(`⚠️ The binding name '${kvNamespaceName}' is not valid.`));
    console.log(chalk.yellow('A valid binding name must start with a letter and contain only letters, numbers, hyphens, and underscores.'));
    
    // Ask for a new binding name
    const { newBindingName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'newBindingName',
        message: 'Please enter a valid binding name:',
        default: 'USER_RATE_LIMIT_KV',
        validate: (input) => {
          if (!input.trim()) return 'Binding name cannot be empty';
          if (!isValidBindingName(input)) return 'Binding name must start with a letter and contain only letters, numbers, hyphens, and underscores';
          return true;
        }
      }
    ]);
    
    kvNamespaceName = newBindingName;
    console.log(chalk.green(`✓ Valid binding name: ${kvNamespaceName}`));
  }
  
  let kvNamespaceId = '';

  try {
    // Check if namespace already exists by listing all namespaces
    console.log(chalk.yellow('Checking existing KV Namespaces...'));
    
    // Try first with old syntax
    let listCommand = 'wrangler kv:namespace list';
    console.log(chalk.blue(`Executing command: ${listCommand}`));
    
    let listOutput;
    try {
      listOutput = execSync(listCommand, { encoding: 'utf8' });
    } catch (error) {
      // If old syntax fails, try with new syntax
      listCommand = 'wrangler kv namespace list';
      console.log(chalk.blue(`Executing command: ${listCommand}`));
      listOutput = execSync(listCommand, { encoding: 'utf8' });
    }
    
    console.log(chalk.cyan('List of KV Namespaces:'));
    console.log(listOutput);
    
    // Parse JSON output
    let namespaces = [];
    try {
      namespaces = JSON.parse(listOutput);
    } catch (error) {
      console.log(chalk.yellow('Unable to parse JSON output, attempting text format analysis...'));
      
      // Search for namespace with or without prefix (old text format)
      const exactNamespaceMatch = listOutput.match(new RegExp(`${kvNamespaceName}\\s+([a-f0-9-]+)`));
      const prefixedNamespaceMatch = listOutput.match(new RegExp(`microservices-secrets-manager-${kvNamespaceName}\\s+([a-f0-9-]+)`));
      const anyPrefixMatch = listOutput.match(new RegExp(`[\\w-]*${kvNamespaceName}[\\s]+([a-f0-9-]+)`));
      
      if (exactNamespaceMatch && exactNamespaceMatch[1]) {
        kvNamespaceId = exactNamespaceMatch[1];
        console.log(chalk.green(`✓ KV Namespace '${kvNamespaceName}' found with ID: ${kvNamespaceId}`));
      } else if (prefixedNamespaceMatch && prefixedNamespaceMatch[1]) {
        kvNamespaceId = prefixedNamespaceMatch[1];
        console.log(chalk.green(`✓ KV Namespace 'microservices-secrets-manager-${kvNamespaceName}' found with ID: ${kvNamespaceId}`));
      } else if (anyPrefixMatch && anyPrefixMatch[1]) {
        kvNamespaceId = anyPrefixMatch[1];
        console.log(chalk.green(`✓ KV Namespace containing '${kvNamespaceName}' found with ID: ${kvNamespaceId}`));
      }
    }

    // If we successfully parsed the JSON, look for the namespace in the list
    if (namespaces.length > 0) {
      // Look for a namespace that contains the searched name
      const foundNamespace = namespaces.find(ns => 
        ns.title === kvNamespaceName || 
        ns.title === `microservices-secrets-manager-${kvNamespaceName}` ||
        ns.title.includes(kvNamespaceName)
      );
      
      if (foundNamespace) {
        kvNamespaceId = foundNamespace.id;
        console.log(chalk.green(`✓ KV Namespace '${foundNamespace.title}' found with ID: ${kvNamespaceId}`));
      } else {
        console.log(chalk.yellow(`No KV Namespace containing '${kvNamespaceName}' was found in the list.`));
        
        // Display all available namespaces to help the user
        console.log(chalk.cyan('Available namespaces:'));
        namespaces.forEach(ns => {
          console.log(chalk.cyan(`- ${ns.title} (ID: ${ns.id})`));
        });
        
        // If namespace doesn't exist, ask user if they want to create it
        const { shouldCreateNamespace } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldCreateNamespace',
            message: `No KV Namespace containing '${kvNamespaceName}' was found. Do you want to create a new one?`,
            default: true
          }
        ]);
        
        if (shouldCreateNamespace) {
          // Create a new namespace with a unique name to avoid conflicts
          const uniqueName = `${kvNamespaceName}_${Date.now().toString().slice(-6)}`;
          
          // Validate unique name
          if (!isValidBindingName(uniqueName)) {
            console.log(chalk.yellow(`⚠️ Generated name '${uniqueName}' is not valid.`));
            console.log(chalk.yellow('Generating alternative name...'));
            
            // Generate an alternative name that respects rules
            const alternativeName = `KV_${kvNamespaceName.replace(/[^A-Za-z0-9_-]/g, '')}_${Date.now().toString().slice(-6)}`;
            
            if (isValidBindingName(alternativeName)) {
              console.log(chalk.green(`✓ Valid alternative name generated: ${alternativeName}`));
              // Use this alternative name
              // ...
            } else {
              // Ask user to provide a valid name
              // ...
            }
          } else {
            // ... rest of the code for creating with a valid unique name ...
          }
        } else {
          // If user doesn't want to create a namespace, ask for manually
          const { manualKvId } = await inquirer.prompt([
            {
              type: 'input',
              name: 'manualKvId',
              message: 'Please enter the ID of an existing KV Namespace:',
              validate: (input) => input.trim() !== '' ? true : 'KV Namespace ID is required'
            }
          ]);
          
          kvNamespaceId = manualKvId.trim();
        }
      }
    }
  } catch (error) {
    console.log(chalk.red(`Error during KV Namespace configuration: ${error.message}`));
    
    // Ask for manually in last resort
    const { manualKvId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'manualKvId',
        message: 'Please enter the ID of an existing KV Namespace or create one manually with the command:\n' +
                `wrangler kv:namespace create "${kvNamespaceName}" and enter the ID:`,
        validate: (input) => input.trim() !== '' ? true : 'KV Namespace ID is required'
      }
    ]);
    
    kvNamespaceId = manualKvId.trim();
  }

  // Update wrangler.toml with the KV Namespace ID
  if (kvNamespaceId) {
    try {
      const updateSuccess = updateWranglerToml({
        kv_namespace: {
          binding: kvNamespaceName,
          id: kvNamespaceId
        }
      });
      
      if (updateSuccess) {
        console.log(chalk.green(`✓ Fichier wrangler.toml mis à jour avec l'ID du KV Namespace: ${kvNamespaceId}`));
      } else {
        throw new Error("La mise à jour du fichier wrangler.toml a échoué");
      }
    } catch (error) {
      console.error(chalk.red(`❌ Erreur lors de la mise à jour du fichier wrangler.toml: ${error.message}`));
      console.log(chalk.yellow(`⚠️ Veuillez mettre à jour manuellement le fichier wrangler.toml avec votre ID de KV Namespace: ${kvNamespaceId}`));
    }
  }
  
  // Step 6: Configure wrangler.toml
  console.log(chalk.blue('\nConfiguring wrangler.toml...'));
  
  // Verify that the account_id has been retrieved
  if (!accountId) {
    console.log(chalk.yellow('⚠️ Account ID not detected. Please provide manually:'));
    
    const { manualAccountId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'manualAccountId',
        message: 'Please enter your Cloudflare Account ID:',
        default: '8ddcdf05102845408a7c4593f64dd68d', // ID extracted from logs
        validate: (input) => input.trim() !== '' ? true : 'Account ID is required'
      }
    ]);
    
    accountId = manualAccountId.trim();
  }
  
  // Display the account_id for confirmation and verification
  console.log(chalk.blue(`Using Account ID: ${accountId} for configuration`));

  // Verify file wrangler.toml permissions
  const wranglerTomlPath = path.resolve(process.cwd(), 'wrangler.toml');
  let canWriteToFile = false;

  try {
    // Check if file exists
    if (fs.existsSync(wranglerTomlPath)) {
      // Verify permissions
      try {
        // Try to access file in write mode
        fs.accessSync(wranglerTomlPath, fs.constants.W_OK);
        canWriteToFile = true;
        console.log(chalk.green('✓ wrangler.toml write permissions verified.'));
      } catch (accessError) {
        console.log(chalk.red(`❌ No write permission on wrangler.toml: ${accessError.message}`));
        
        // Ask user to correct permissions
        const { fixPermissions } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'fixPermissions',
            message: 'Do you want to try to fix the permissions of the file?',
            default: true
          }
        ]);
        
        if (fixPermissions) {
          try {
            // Try to modify permissions (only works on Unix/Linux/Mac)
            execSync(`chmod 644 "${wranglerTomlPath}"`, { stdio: 'inherit' });
            console.log(chalk.green('✓ Permissions modified.'));
            canWriteToFile = true;
          } catch (chmodError) {
            console.log(chalk.red(`❌ Unable to modify permissions: ${chmodError.message}`));
          }
        }
      }
    } else {
      // File doesn't exist, we can create it
      canWriteToFile = true;
      console.log(chalk.yellow('wrangler.toml file doesn\'t exist and will be created.'));
    }
  } catch (error) {
    console.log(chalk.red(`Error verifying permissions: ${error.message}`));
  }

  // Update or create wrangler.toml file
  if (canWriteToFile) {
    try {
      const updateSuccess = updateWranglerToml({
        account_id: accountId,
        kv_namespace: {
          binding: kvNamespaceName,
          id: kvNamespaceId
        }
      });
      
      if (updateSuccess) {
        console.log(chalk.green('✓ Fichier wrangler.toml créé/mis à jour avec succès.'));
        
        // Vérifier que le fichier a été correctement écrit
        const verifyContent = fs.readFileSync(wranglerTomlPath, 'utf8');
        if (verifyContent.includes(`account_id = "${accountId}"`)) {
          console.log(chalk.green(`✓ Vérification réussie: ID de compte ${accountId} correctement configuré.`));
        } else {
          throw new Error("L'ID de compte n'a pas été correctement écrit dans le fichier.");
        }
        
        // Vérifier que wrangler peut lire le fichier correctement
        try {
          console.log(chalk.blue('Vérification que wrangler peut lire le fichier correctement...'));
          const wranglerOutput = execSync('wrangler whoami', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
          console.log(chalk.green('✓ wrangler peut accéder au fichier.'));
        } catch (wranglerError) {
          console.log(chalk.yellow(`⚠️ Avertissement: wrangler pourrait avoir des problèmes avec le fichier: ${wranglerError.message}`));
        }
      } else {
        throw new Error("La mise à jour du fichier wrangler.toml a échoué");
      }
    } catch (writeError) {
      console.log(chalk.red(`❌ Erreur lors de l'écriture du fichier: ${writeError.message}`));
      
      // Créer un fichier temporaire comme solution de secours
      try {
        const tempPath = path.resolve(process.cwd(), 'wrangler.toml.new');
        const existingConfig = parseWranglerToml();
        const updatedConfig = {
          ...existingConfig,
          account_id: accountId,
          kv_namespace: {
            binding: kvNamespaceName,
            id: kvNamespaceId
          }
        };
        
        const tomlContent = generateWranglerToml(updatedConfig);
        
        fs.writeFileSync(tempPath, tomlContent, 'utf8');
        console.log(chalk.yellow(`✓ Fichier temporaire créé: ${tempPath}`));
        console.log(chalk.yellow(`Veuillez remplacer manuellement le contenu de wrangler.toml avec ce fichier.`));
        
        // Demander à l'utilisateur de confirmer la mise à jour manuelle
        const { manualUpdate } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'manualUpdate',
            message: 'Have you manually updated the wrangler.toml file?',
            default: false
          }
        ]);
        
        if (manualUpdate) {
          console.log(chalk.green('✓ Configuration manually updated.'));
        } else {
          console.log(chalk.red('⚠️ You must update the wrangler.toml file before continuing.'));
          console.log(chalk.yellow(`Please edit the file and set: account_id = "${accountId}"`));
          
          // Stop script here to avoid further errors
          console.log(chalk.red('The script stops here. Please update the file and restart the script.'));
          process.exit(1);
        }
      } catch (tempError) {
        console.log(chalk.red(`❌ Temporary file creation failed: ${tempError.message}`));
        console.log(chalk.yellow(`Please manually edit wrangler.toml and set: account_id = "${accountId}"`));
        
        // Stop script here to avoid further errors
        console.log(chalk.red('The script stops here. Please update the file and restart the script.'));
        process.exit(1);
      }
    }
  } else {
    console.log(chalk.red('❌ Unable to write to wrangler.toml file.'));
    console.log(chalk.yellow(`Please manually edit wrangler.toml and set: account_id = "${accountId}"`));
    
    // Ask user to confirm manual update
    const { manualUpdate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'manualUpdate',
        message: 'Have you manually updated the wrangler.toml file?',
        default: false
      }
    ]);
    
    if (!manualUpdate) {
      console.log(chalk.red('The script stops here. Please update the file and restart the script.'));
      process.exit(1);
    }
  }

  // Verify that the account_id is correctly configured before continuing
  try {
    console.log(chalk.blue('\nFinal verification of configuration...'));
    
    // Run wrangler with --config option to specify configuration file
    const testCmd = `wrangler whoami --config="${wranglerTomlPath}"`;
    try {
      const testOutput = execSync(testCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      if (!testOutput.includes('WARNING') && !testOutput.includes('account_id')) {
        console.log(chalk.green('✓ Configuration verified successfully.'));
      } else {
        console.log(chalk.yellow('⚠️ Warnings still present in configuration.'));
        
        // Last attempt with --account-id option
        console.log(chalk.blue('Attempt with --account-id option...'));
        const accountIdCmd = `wrangler whoami --account-id=${accountId}`;
        const accountIdOutput = execSync(accountIdCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        console.log(chalk.green('✓ --account-id option works correctly.'));
        
        // Inform user that he will need to use this option
        console.log(chalk.yellow('⚠️ For subsequent commands, you will need to use the --account-id option'));
      }
    } catch (testError) {
      console.log(chalk.red(`❌ Error verifying configuration: ${testError.message}`));
    }
  } catch (error) {
    console.log(chalk.red(`❌ Final verification error: ${error.message}`));
  }
  
  // Step 7: Add environment variables
  console.log(chalk.blue('\nSetting up environment variables...'));
  
  const { addVariables } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addVariables',
      message: 'Would you like to add environment variables now?',
      default: true
    }
  ]);
  
  if (addVariables) {
    let addingVariables = true;
    const variables = [];
    
    while (addingVariables) {
      const { varName, varValue, varEnv } = await inquirer.prompt([
        {
          type: 'input',
          name: 'varName',
          message: 'Enter variable name (without environment suffix):',
          validate: (input) => {
            if (!input.trim()) return 'Variable name is required';
            
            const validation = isValidBindingName(input);
            if (!validation.valid) {
              return validation.message;
            }
            
            return true;
          }
        },
        {
          type: 'list',
          name: 'varEnv',
          message: 'Select environment:',
          choices: ['development', 'staging', 'production']
        },
        {
          type: 'input',
          name: 'varValue',
          message: 'Enter variable value:',
          validate: (input) => input !== undefined ? true : 'Variable value is required'
        }
      ]);
      
      variables.push({ name: varName.trim(), env: varEnv, value: varValue });
      
      const { addAnother } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addAnother',
          message: 'Add another variable?',
          default: false
        }
      ]);
      
      addingVariables = addAnother;
    }
    
    // Update wrangler.toml with the new variables
    if (variables.length > 0) {
      try {
        const varsUpdate = {};
        variables.forEach(v => {
          varsUpdate[`${v.name}_${v.env}`] = v.value;
        });
        
        const updateSuccess = updateWranglerToml({
          vars: varsUpdate
        });
        
        if (updateSuccess) {
          console.log(chalk.green(`✓ ${variables.length} variables ajoutées à wrangler.toml`));
        } else {
          throw new Error("La mise à jour des variables dans wrangler.toml a échoué");
        }
      } catch (error) {
        console.log(chalk.red(`Échec de la mise à jour des variables dans wrangler.toml: ${error.message}`));
      }
    }
  }
  
  // New step: Add secrets
  console.log(chalk.blue('\nConfiguring secrets...'));
  
  const { addSecrets } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addSecrets',
      message: 'Would you like to add secrets now?',
      default: true
    }
  ]);
  
  if (addSecrets) {
    let addingSecrets = true;
    const secrets = [];
    
    console.log(chalk.yellow('\nℹ️ Secrets are sensitive variables that will be stored securely.'));
    console.log(chalk.yellow('They follow the naming convention: SECRET_{NAME}_{environment}'));
    console.log(chalk.yellow('Example: SECRET_API_KEY_development\n'));
    console.log(chalk.yellow('Note: The environment suffix is only for naming convention.'));
    console.log(chalk.yellow('      All secrets are stored in the same Cloudflare environment.\n'));
    
    while (addingSecrets) {
      const { secretName, secretEnv } = await inquirer.prompt([
        {
          type: 'input',
          name: 'secretName',
          message: 'Enter the secret name (without SECRET_ prefix or environment suffix):',
          validate: (input) => {
            if (!input.trim()) return 'Secret name is required';
            
            const validation = isValidBindingName(input);
            if (!validation.valid) {
              return validation.message;
            }
            
            return true;
          }
        },
        {
          type: 'list',
          name: 'secretEnv',
          message: 'Select the environment suffix for the secret name:',
          choices: ['development', 'staging', 'production']
        }
      ]);
      
      // Format the complete secret name
      const fullSecretName = `SECRET_${secretName.trim().toUpperCase()}_${secretEnv}`;
      
      console.log(chalk.blue(`\nConfiguring secret: ${fullSecretName}`));
      console.log(chalk.yellow('You will be prompted to enter the secret value.'));
      console.log(chalk.yellow('The value will not be displayed on screen for security reasons.'));
      
      try {
        // Use spawn to allow interactive secret input
        // CORRECTION: Don't use --env flag, as we only have one environment
        console.log(chalk.blue(`Executing: wrangler secret put ${fullSecretName}`));
        
        const wranglerProc = spawn('wrangler', ['secret', 'put', fullSecretName], {
          stdio: ['inherit', 'inherit', 'inherit']
        });
        
        await new Promise((resolve, reject) => {
          wranglerProc.on('close', (code) => {
            if (code === 0) {
              console.log(chalk.green(`✓ Secret ${fullSecretName} configured successfully.`));
              secrets.push({ name: secretName.trim(), env: secretEnv });
              resolve();
            } else {
              console.log(chalk.red(`❌ Secret configuration failed for ${fullSecretName} (code: ${code}).`));
              reject(new Error(`wrangler secret put failed with code ${code}`));
            }
          });
        });
      } catch (error) {
        console.log(chalk.red(`Error configuring secret: ${error.message}`));
        console.log(chalk.yellow(`You can configure this secret manually later with: wrangler secret put ${fullSecretName}`));
      }
      
      const { addAnotherSecret } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addAnotherSecret',
          message: 'Add another secret?',
          default: false
        }
      ]);
      
      addingSecrets = addAnotherSecret;
    }
    
    if (secrets.length > 0) {
      console.log(chalk.green(`\n✓ ${secrets.length} secret(s) configured successfully.`));
      console.log(chalk.yellow('Reminder: Secrets are stored securely and are not visible in wrangler.toml.'));
      console.log(chalk.yellow('Environment suffixes (development, staging, production) are only'));
      console.log(chalk.yellow('used in secret names for naming convention.'));
    }
  } else {
    console.log(chalk.yellow('No secrets configured. You can add them later with the command:'));
    console.log(chalk.yellow('wrangler secret put SECRET_NAME_environment'));
  }
  
  // Step 8: Deploy the worker
  console.log(chalk.blue('\nDeploying the worker...'));
  
  const { deployNow } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'deployNow',
      message: 'Would you like to deploy the worker now?',
      default: true
    }
  ]);
  
  let workerUrl = '';
  
  if (deployNow) {
    try {
      console.log('Deploying worker to Cloudflare...');
      const deployOutput = execSync('wrangler deploy', { encoding: 'utf8' });
      console.log(deployOutput);
      
      console.log(chalk.green('✓ Worker deployed successfully.'));
      
      // Extract worker URL from output
      // Search for URL in different possible formats
      const urlMatch = deployOutput.match(/https:\/\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.workers\.dev/);
      const publishedMatch = deployOutput.match(/Published\s+([^\s]+)/i);
      const availableMatch = deployOutput.match(/Available at\s+([^\s]+)/i);
      
      if (urlMatch) {
        workerUrl = urlMatch[0];
      } else if (publishedMatch && publishedMatch[1]) {
        workerUrl = publishedMatch[1];
      } else if (availableMatch && availableMatch[1]) {
        workerUrl = availableMatch[1];
      } else {
        // If URL can't be extracted, construct it
        const workerName = 'microservices-secrets-manager'; // Or retrieve from wrangler.toml
        workerUrl = `https://${workerName}.${accountId}.workers.dev`;
      }
      
      console.log(chalk.green(`Worker URL: ${workerUrl}`));
      
      // Continue with the rest of the code using workerUrl
      // ...
      
    } catch (error) {
      console.error(chalk.red(`Error deploying worker: ${error.message}`));
      console.log(chalk.yellow('Please deploy the worker manually using the command: wrangler deploy'));
      
      // Set workerUrl as null or undefined to indicate deployment failed
      const workerUrl = null;
    }
  } else {
    console.log(chalk.yellow('Skipping deployment. You can deploy later with: wrangler deploy'));
  }
  
  // Step 9: Set up the master password
  console.log(chalk.blue('\nSetting up the master password...'));
  
  if (deployNow) {
    const { setupPassword } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'setupPassword',
        message: 'Would you like to set up the master password now?',
        default: true
      }
    ]);
    
    if (setupPassword) {
      let masterPassword = '';
      
      // Ask for master password
      const passwordPrompt = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Enter a strong master password (min 12 characters recommended):',
          validate: (input) => {
            if (!input || input.length < 8) {
              return 'Password must be at least 8 characters long';
            }
            return true;
          }
        }
      ]);
      
      masterPassword = passwordPrompt.password;
      
      // Loop for password confirmation
      let passwordsMatch = false;
      
      while (!passwordsMatch) {
        // Ask for password confirmation without validation
        const confirmPrompt = await inquirer.prompt([
          {
            type: 'password',
            name: 'confirmPassword',
            message: 'Confirm password:'
          }
        ]);
        
        // Manually check if passwords match
        if (masterPassword === confirmPrompt.confirmPassword) {
          passwordsMatch = true;
        } else {
          console.log(chalk.red('Passwords do not match. Please try again.'));
          // Loop will continue and ask for confirmation again
          // Without validation, the field will be empty on each new attempt
        }
      }

      try {
        console.log('Setting master password...');
        
        // Configure master password only for default environment
        const wranglerProc = spawn('wrangler', ['secret', 'put', 'MASTER_PASSWORD'], {
          stdio: ['pipe', 'inherit', 'inherit']
        });
        
        wranglerProc.stdin.write(masterPassword);
        wranglerProc.stdin.end();
        
        await new Promise((resolve, reject) => {
          wranglerProc.on('close', (code) => {
            if (code === 0) {
              console.log(chalk.green('✓ Master password set successfully.'));
              resolve();
            } else {
              reject(new Error(`wrangler secret put failed with code ${code}`));
            }
          });
        });
        
        // Add security information message
        console.log(chalk.yellow('\n⚠️ IMPORTANT: The master password has been configured for this worker only.'));
        console.log(chalk.yellow('This worker should not be deployed in different environments for security reasons.'));
        
      } catch (error) {
        console.log(chalk.red(`Error setting master password: ${error.message}`));
        throw error; // Propagate error for appropriate handling
      }
    } else {
      console.log(chalk.yellow('⚠️ IMPORTANT: You must set a master password before using the secrets manager.'));
      console.log(chalk.yellow('Run this command manually: wrangler secret put MASTER_PASSWORD'));
    }
  } else {
    console.log(chalk.yellow('⚠️ IMPORTANT: After deploying, you must set a master password:'));
    console.log(chalk.yellow('wrangler secret put MASTER_PASSWORD'));
  }
  
  // Step 10: Final instructions
  console.log(chalk.green('\n🎉 Setup completed successfully!'));
  console.log(chalk.blue('\nNext steps:'));
  
  if (workerUrl) {
    console.log(chalk.blue('1. Your secrets manager is available at:'), chalk.cyan(workerUrl));
  } else {
    console.log(chalk.blue('1. Deploy your worker with:'), chalk.cyan('wrangler deploy'));
  }
  
  console.log(chalk.blue('2. Add the setSecrets.js file to each client microservice'));
  console.log(chalk.blue('3. Update the SECRETS_WORKER_URL in each setSecrets.js file to point to your worker'));
  console.log(chalk.blue('4. Add the apply-secrets scripts to each client\'s package.json'));
  console.log(chalk.blue('5. Open the client worker directory in your terminal'));
  console.log(chalk.blue('6. Execute npm run apply-secrets:{environment}'));
  
  console.log(chalk.yellow('\n⚠️ IMPORTANT SECURITY REMINDER:'));
  console.log('- Keep your master password secure');
  console.log('- Share it only with authorized team members');
  console.log('- Consider rotating the password every 90 days');
  
  console.log(chalk.blue('\nFor more information, refer to the README.md file.'));
}

// Add proper error handling for the entire wizard
runSetupWizard().catch(error => {
  console.error(chalk.red(`Setup wizard error: ${error.message}`));
  process.exit(1);
});
