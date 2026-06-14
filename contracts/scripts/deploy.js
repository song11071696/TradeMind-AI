const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "BNB");

  // 1. Deploy MockERC20 (for testnet; on mainnet use real token address)
  console.log("\n1. Deploying MockERC20 (test token)...");
  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  const mockToken = await MockERC20.deploy("Test USDT", "USDT", 18);
  await mockToken.waitForDeployment();
  const mockTokenAddr = await mockToken.getAddress();
  console.log("   MockERC20 deployed to:", mockTokenAddr);

  // 2. Deploy YieldMindCore
  console.log("\n2. Deploying YieldMindCore...");
  const YieldMindCore = await hre.ethers.getContractFactory("YieldMindCore");
  const core = await YieldMindCore.deploy(mockTokenAddr, deployer.address);
  await core.waitForDeployment();
  const coreAddr = await core.getAddress();
  console.log("   YieldMindCore deployed to:", coreAddr);

  // 3. Deploy YieldMindVault
  console.log("\n3. Deploying YieldMindVault...");
  const YieldMindVault = await hre.ethers.getContractFactory("YieldMindVault");
  const vault = await YieldMindVault.deploy(mockTokenAddr, deployer.address);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log("   YieldMindVault deployed to:", vaultAddr);

  // 4. Deploy YieldStrategy (PancakeSwap LP)
  console.log("\n4. Deploying YieldStrategy (PancakeSwap LP)...");
  const YieldStrategy = await hre.ethers.getContractFactory("YieldStrategy");
  const strategy1 = await YieldStrategy.deploy(
    "PancakeSwap LP",
    "PancakeSwap",
    800,
    mockTokenAddr,
    deployer.address,
    deployer.address
  );
  await strategy1.waitForDeployment();
  const strategy1Addr = await strategy1.getAddress();
  console.log("   YieldStrategy (PancakeSwap) deployed to:", strategy1Addr);

  // 5. Deploy YieldStrategy (Venus Lending)
  console.log("\n5. Deploying YieldStrategy (Venus Lending)...");
  const strategy2 = await YieldStrategy.deploy(
    "Venus Lending",
    "Venus",
    500,
    mockTokenAddr,
    deployer.address,
    deployer.address
  );
  await strategy2.waitForDeployment();
  const strategy2Addr = await strategy2.getAddress();
  console.log("   YieldStrategy (Venus) deployed to:", strategy2Addr);

  // 6. Setup: Transfer strategy ownership to YieldMindCore and add strategies
  console.log("\n6. Setting up strategies...");
  await strategy1.transferOwnership(coreAddr);
  console.log("   Strategy1 ownership transferred to YieldMindCore");
  await strategy2.transferOwnership(coreAddr);
  console.log("   Strategy2 ownership transferred to YieldMindCore");

  await core.addStrategy(strategy1Addr, "PancakeSwap LP", 6000);
  console.log("   Strategy1 added to YieldMindCore (60% allocation)");
  await core.addStrategy(strategy2Addr, "Venus Lending", 4000);
  console.log("   Strategy2 added to YieldMindCore (40% allocation)");

  // Summary
  console.log("\n========================================");
  console.log("  DEPLOYMENT SUMMARY");
  console.log("========================================");
  console.log("Network:         ", hre.network.name);
  console.log("Chain ID:        ", (await hre.ethers.provider.getNetwork()).chainId.toString());
  console.log("Deployer:        ", deployer.address);
  console.log("----------------------------------------");
  console.log("MockERC20:       ", mockTokenAddr);
  console.log("YieldMindCore:   ", coreAddr);
  console.log("YieldMindVault:  ", vaultAddr);
  console.log("Strategy (PCS):  ", strategy1Addr);
  console.log("Strategy (Venus):", strategy2Addr);
  console.log("========================================\n");

  // Write deployment info to file
  const fs = require("fs");
  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    contracts: {
      MockERC20: mockTokenAddr,
      YieldMindCore: coreAddr,
      YieldMindVault: vaultAddr,
      YieldStrategy_PancakeSwap: strategy1Addr,
      YieldStrategy_Venus: strategy2Addr,
    },
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(
    `deployments/${hre.network.name}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`Deployment info saved to deployments/${hre.network.name}.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
