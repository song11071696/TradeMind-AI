const { ethers, network } = require("hardhat");

async function main() {
  console.log("Deploying YieldMind contracts to", network.name, "...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // Deploy MockERC20 (for testnet only)
  console.log("\n1. Deploying MockERC20...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("Test USDT", "USDT", 18);
  await mockToken.waitForDeployment();
  console.log("MockERC20 deployed to:", await mockToken.getAddress());

  // Mint test tokens
  console.log("Minting test tokens...");
  await mockToken.mint(deployer.address, ethers.parseEther("1000000"));
  console.log("Minted 1,000,000 USDT to deployer");

  // Deploy YieldMindCore
  console.log("\n2. Deploying YieldMindCore...");
  const YieldMindCore = await ethers.getContractFactory("YieldMindCore");
  const yieldMind = await YieldMindCore.deploy(
    await mockToken.getAddress(),
    deployer.address
  );
  await yieldMind.waitForDeployment();
  console.log("YieldMindCore deployed to:", await yieldMind.getAddress());

  // Deploy Yield Strategies
  console.log("\n3. Deploying Yield Strategies...");

  // Strategy 1: PancakeSwap LP
  const YieldStrategy = await ethers.getContractFactory("YieldStrategy");

  const strategy1 = await YieldStrategy.deploy(
    "PancakeSwap LP",
    "PancakeSwap",
    800, // 8% APY
    await mockToken.getAddress(),
    deployer.address,
    deployer.address
  );
  await strategy1.waitForDeployment();
  console.log("PancakeSwap LP Strategy deployed to:", await strategy1.getAddress());

  // Strategy 2: Venus Lending
  const strategy2 = await YieldStrategy.deploy(
    "Venus Lending",
    "Venus",
    500, // 5% APY
    await mockToken.getAddress(),
    deployer.address,
    deployer.address
  );
  await strategy2.waitForDeployment();
  console.log("Venus Lending Strategy deployed to:", await strategy2.getAddress());

  // Strategy 3: Alpaca Finance
  const strategy3 = await YieldStrategy.deploy(
    "Alpaca Finance",
    "Alpaca",
    1200, // 12% APY
    await mockToken.getAddress(),
    deployer.address,
    deployer.address
  );
  await strategy3.waitForDeployment();
  console.log("Alpaca Finance Strategy deployed to:", await strategy3.getAddress());

  // Add strategies to YieldMind
  console.log("\n4. Adding strategies to YieldMind...");
  await yieldMind.addStrategy(await strategy1.getAddress(), "PancakeSwap LP", 4000);
  console.log("Added PancakeSwap LP with 40% allocation");

  await yieldMind.addStrategy(await strategy2.getAddress(), "Venus Lending", 3500);
  console.log("Added Venus Lending with 35% allocation");

  await yieldMind.addStrategy(await strategy3.getAddress(), "Alpaca Finance", 2500);
  console.log("Added Alpaca Finance with 25% allocation");

  // Print deployment summary
  console.log("\n=== Deployment Summary ===");
  console.log("Network:", network.name);
  console.log("Chain ID:", network.config.chainId);
  console.log("Deployer:", deployer.address);
  console.log("\nContracts:");
  console.log("  MockERC20 (USDT):", await mockToken.getAddress());
  console.log("  YieldMindCore:", await yieldMind.getAddress());
  console.log("  PancakeSwap LP Strategy:", await strategy1.getAddress());
  console.log("  Venus Lending Strategy:", await strategy2.getAddress());
  console.log("  Alpaca Finance Strategy:", await strategy3.getAddress());
  console.log("\nVault APY:", (await yieldMind.getVaultAPY()).toString(), "basis points");
  console.log("Active Strategies:", (await yieldMind.getStrategyCount()).toString());

  // Save deployment addresses
  const deployment = {
    network: network.name,
    chainId: network.config.chainId,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      mockToken: await mockToken.getAddress(),
      yieldMindCore: await yieldMind.getAddress(),
      strategies: {
        pancakeSwapLP: await strategy1.getAddress(),
        venusLending: await strategy2.getAddress(),
        alpacaFinance: await strategy3.getAddress(),
      },
    },
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentPath = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath, { recursive: true });
  }
  fs.writeFileSync(
    path.join(deploymentPath, `${network.name}.json`),
    JSON.stringify(deployment, null, 2)
  );
  console.log("\nDeployment addresses saved to deployments/" + network.name + ".json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
