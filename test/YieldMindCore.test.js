const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("YieldMindCore", function () {
  let yieldMind, mockToken, strategy1, strategy2;
  let owner, user1, user2, harvester, guardian;
  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const DEPOSIT_AMOUNT = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, user1, user2, harvester, guardian] = await ethers.getSigners();

    // Deploy mock token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Test USDT", "USDT", 18);
    await mockToken.waitForDeployment();

    // Deploy YieldMindCore
    const YieldMindCore = await ethers.getContractFactory("YieldMindCore");
    yieldMind = await YieldMindCore.deploy(
      await mockToken.getAddress(),
      owner.address
    );
    await yieldMind.waitForDeployment();

    // Deploy strategies
    const YieldStrategy = await ethers.getContractFactory("YieldStrategy");
    strategy1 = await YieldStrategy.deploy(
      "PancakeSwap LP",
      "PancakeSwap",
      800, // 8% APY
      await mockToken.getAddress(),
      owner.address,
      owner.address
    );
    await strategy1.waitForDeployment();

    strategy2 = await YieldStrategy.deploy(
      "Venus Lending",
      "Venus",
      500, // 5% APY
      await mockToken.getAddress(),
      owner.address,
      owner.address
    );
    await strategy2.waitForDeployment();

    // Mint tokens to users
    await mockToken.mint(user1.address, INITIAL_SUPPLY);
    await mockToken.mint(user2.address, INITIAL_SUPPLY);

    // Approve YieldMind
    await mockToken.connect(user1).approve(await yieldMind.getAddress(), INITIAL_SUPPLY);
    await mockToken.connect(user2).approve(await yieldMind.getAddress(), INITIAL_SUPPLY);

    // Grant roles
    const HARVESTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("HARVESTER_ROLE"));
    const GUARDIAN_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GUARDIAN_ROLE"));
    await yieldMind.grantRole(HARVESTER_ROLE, harvester.address);
    await yieldMind.grantRole(GUARDIAN_ROLE, guardian.address);

    // Add strategies
    await yieldMind.addStrategy(await strategy1.getAddress(), "PancakeSwap LP", 6000);
    await yieldMind.addStrategy(await strategy2.getAddress(), "Venus Lending", 4000);
  });

  describe("Deployment", function () {
    it("Should set the correct deposit token", async function () {
      expect(await yieldMind.depositToken()).to.equal(await mockToken.getAddress());
    });

    it("Should set the correct admin", async function () {
      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
      expect(await yieldMind.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("Should have correct initial state", async function () {
      expect(await yieldMind.totalDeposits()).to.equal(0);
      expect(await yieldMind.totalShares()).to.equal(0);
      expect(await yieldMind.getStrategyCount()).to.equal(2);
    });
  });

  describe("Strategy Management", function () {
    it("Should add a new strategy", async function () {
      const YieldStrategy = await ethers.getContractFactory("YieldStrategy");
      const newStrategy = await YieldStrategy.deploy(
        "New Strategy",
        "NewProtocol",
        600,
        await mockToken.getAddress(),
        owner.address,
        owner.address
      );
      await newStrategy.waitForDeployment();

      await yieldMind.addStrategy(
        await newStrategy.getAddress(),
        "New Strategy",
        1000
      );

      expect(await yieldMind.getStrategyCount()).to.equal(3);
    });

    it("Should reject strategy with zero address", async function () {
      await expect(
        yieldMind.addStrategy(ethers.ZeroAddress, "Zero", 1000)
      ).to.be.revertedWith("YieldMind: zero address");
    });

    it("Should reject duplicate strategy", async function () {
      await expect(
        yieldMind.addStrategy(await strategy1.getAddress(), "Duplicate", 1000)
      ).to.be.revertedWith("YieldMind: strategy exists");
    });

    it("Should update strategy allocation", async function () {
      await yieldMind.updateStrategyAllocation(await strategy1.getAddress(), 7000);
      const info = await yieldMind.getStrategyInfo(await strategy1.getAddress());
      expect(info.allocationBps).to.equal(7000);
    });

    it("Should remove a strategy", async function () {
      await yieldMind.removeStrategy(await strategy2.getAddress());
      expect(await yieldMind.getStrategyCount()).to.equal(1);
    });
  });

  describe("Deposits", function () {
    it("Should deposit tokens correctly", async function () {
      await yieldMind.connect(user1).deposit(DEPOSIT_AMOUNT);

      const [depositAmount, sharesAmount] = await yieldMind.getUserBalance(user1.address);
      expect(depositAmount).to.equal(DEPOSIT_AMOUNT);
      expect(sharesAmount).to.equal(DEPOSIT_AMOUNT); // 1:1 for first deposit
    });

    it("Should update total deposits", async function () {
      await yieldMind.connect(user1).deposit(DEPOSIT_AMOUNT);
      expect(await yieldMind.totalDeposits()).to.equal(DEPOSIT_AMOUNT);
    });

    it("Should emit Deposit event", async function () {
      await expect(yieldMind.connect(user1).deposit(DEPOSIT_AMOUNT))
        .to.emit(yieldMind, "Deposit")
        .withArgs(user1.address, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
    });

    it("Should reject zero deposit", async function () {
      await expect(
        yieldMind.connect(user1).deposit(0)
      ).to.be.revertedWith("YieldMind: zero amount");
    });

    it("Should handle multiple deposits", async function () {
      await yieldMind.connect(user1).deposit(DEPOSIT_AMOUNT);
      await yieldMind.connect(user2).deposit(DEPOSIT_AMOUNT);

      expect(await yieldMind.totalDeposits()).to.equal(DEPOSIT_AMOUNT * 2n);
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      await yieldMind.connect(user1).deposit(DEPOSIT_AMOUNT);
    });

    it("Should withdraw tokens correctly", async function () {
      const shares = (await yieldMind.getUserBalance(user1.address))[1];
      const balanceBefore = await mockToken.balanceOf(user1.address);

      await yieldMind.connect(user1).withdraw(shares);

      const balanceAfter = await mockToken.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(DEPOSIT_AMOUNT);
    });

    it("Should emit Withdraw event", async function () {
      const shares = (await yieldMind.getUserBalance(user1.address))[1];
      await expect(yieldMind.connect(user1).withdraw(shares))
        .to.emit(yieldMind, "Withdraw")
        .withArgs(user1.address, DEPOSIT_AMOUNT, shares);
    });

    it("Should reject zero withdrawal", async function () {
      await expect(
        yieldMind.connect(user1).withdraw(0)
      ).to.be.revertedWith("YieldMind: zero shares");
    });

    it("Should reject withdrawal exceeding balance", async function () {
      const shares = (await yieldMind.getUserBalance(user1.address))[1];
      await expect(
        yieldMind.connect(user1).withdraw(shares + 1n)
      ).to.be.revertedWith("YieldMind: insufficient shares");
    });
  });

  describe("Harvest", function () {
    it("Should harvest rewards from strategy", async function () {
      await yieldMind.connect(user1).deposit(DEPOSIT_AMOUNT);

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [3600]); // 1 hour
      await ethers.provider.send("evm_mine");

      await expect(yieldMind.connect(harvester).harvest(await strategy1.getAddress()))
        .to.emit(yieldMind, "Harvest");
    });

    it("Should reject harvest from non-harvester", async function () {
      await yieldMind.connect(user1).deposit(DEPOSIT_AMOUNT);

      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine");

      await expect(
        yieldMind.connect(user1).harvest(await strategy1.getAddress())
      ).to.be.revertedWith("YieldMind: not harvester");
    });
  });

  describe("Rebalance", function () {
    it("Should rebalance portfolio", async function () {
      await yieldMind.connect(harvester).rebalance([7000, 3000]);
      expect(await yieldMind.totalAllocatedBps()).to.equal(10000);
    });

    it("Should reject invalid allocations", async function () {
      await expect(
        yieldMind.connect(harvester).rebalance([5000, 4000]) // sums to 9000, not 10000
      ).to.be.revertedWith("YieldMind: allocations must sum to 10000");
    });
  });

  describe("Emergency Functions", function () {
    it("Should pause the contract", async function () {
      await yieldMind.connect(guardian).pause();
      expect(await yieldMind.paused()).to.be.true;
    });

    it("Should unpause the contract", async function () {
      await yieldMind.connect(guardian).pause();
      await yieldMind.connect(guardian).unpause();
      expect(await yieldMind.paused()).to.be.false;
    });

    it("Should reject deposits when paused", async function () {
      await yieldMind.connect(guardian).pause();
      await expect(
        yieldMind.connect(user1).deposit(DEPOSIT_AMOUNT)
      ).to.be.revertedWith("Pausable: paused");
    });
  });

  describe("View Functions", function () {
    it("Should return vault APY", async function () {
      const apy = await yieldMind.getVaultAPY();
      // 8% * 60% + 5% * 40% = 4.8% + 2% = 6.8% = 680 basis points
      expect(apy).to.equal(680);
    });

    it("Should return active strategies", async function () {
      const activeStrategies = await yieldMind.getActiveStrategies();
      expect(activeStrategies.length).to.equal(2);
    });

    it("Should return strategy info", async function () {
      const info = await yieldMind.getStrategyInfo(await strategy1.getAddress());
      expect(info._name).to.equal("PancakeSwap LP");
      expect(info.allocationBps).to.equal(6000);
      expect(info.isActive).to.be.true;
      expect(info.apy).to.equal(800);
    });
  });
});
