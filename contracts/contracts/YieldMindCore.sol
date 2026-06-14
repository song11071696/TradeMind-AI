// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IYieldStrategy.sol";

/**
 * @title YieldMindCore
 * @notice Core contract for the YieldMind AI-Powered DeFi Yield Optimizer
 * @dev Manages user deposits, strategy allocation, and reward distribution
 *
 * Roles:
 * - DEFAULT_ADMIN_ROLE: Full admin access
 * - STRATEGY_MANAGER_ROLE: Can add/remove/update strategies
 * - HARVESTER_ROLE: Can trigger harvest and rebalance operations
 * - GUARDIAN_ROLE: Can pause/unpause in emergencies
 */
contract YieldMindCore is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ==================== Roles ====================
    bytes32 public constant STRATEGY_MANAGER_ROLE = keccak256("STRATEGY_MANAGER_ROLE");
    bytes32 public constant HARVESTER_ROLE = keccak256("HARVESTER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    // ==================== Structs ====================
    struct StrategyInfo {
        address strategyAddress;
        string name;
        uint256 allocationBps; // basis points out of 10000
        uint256 totalDeposited;
        uint256 lastHarvestTimestamp;
        bool isActive;
    }

    struct UserInfo {
        uint256 totalDeposited;
        uint256 totalShares;
        uint256 rewardDebt;
        uint256 lastDepositTimestamp;
        mapping(address => bool) hasDeposited; // strategy => bool
    }

    struct PortfolioAllocation {
        address strategyAddress;
        uint256 allocationBps;
    }

    // ==================== State Variables ====================
    IERC20 public immutable depositToken; // The token users deposit (e.g., USDT, BUSD)
    string public name;
    string public version;
    uint256 public constant MINIMUM_SHARES = 1000; // Dead shares to prevent first-deposit inflation attack

    // Strategy management
    mapping(address => StrategyInfo) public strategies;
    address[] public strategyList;
    uint256 public totalAllocatedBps;

    // User management
    mapping(address => UserInfo) public userInfo;
    uint256 public totalDeposits;
    uint256 public totalShares;

    // Performance metrics
    uint256 public totalRewardsDistributed;
    uint256 public lastRebalanceTimestamp;
    uint256 public harvestInterval; // minimum time between harvests

    // ==================== Events ====================
    event Deposit(address indexed user, uint256 amount, uint256 shares);
    event Withdraw(address indexed user, uint256 amount, uint256 shares);
    event StrategyAdded(address indexed strategy, string name, uint256 allocationBps);
    event StrategyRemoved(address indexed strategy);
    event StrategyUpdated(address indexed strategy, uint256 oldAllocation, uint256 newAllocation);
    event Harvest(address indexed strategy, uint256 rewardAmount);
    event Rebalanced(uint256 timestamp);
    event RewardsDistributed(address indexed user, uint256 amount);
    event PortfolioRebalanced(address[] strategies, uint256[] allocations);

    // ==================== Modifiers ====================
    modifier onlyStrategyManager() {
        require(hasRole(STRATEGY_MANAGER_ROLE, msg.sender), "YieldMind: not strategy manager");
        _;
    }

    modifier onlyHarvester() {
        require(hasRole(HARVESTER_ROLE, msg.sender), "YieldMind: not harvester");
        _;
    }

    modifier onlyGuardian() {
        require(hasRole(GUARDIAN_ROLE, msg.sender), "YieldMind: not guardian");
        _;
    }

    // ==================== Constructor ====================
    /**
     * @notice Initialize the YieldMindCore contract
     * @param _depositToken Address of the deposit token (e.g., USDT)
     * @param _admin Address of the initial admin
     */
    constructor(
        address _depositToken,
        address _admin
    ) {
        require(_depositToken != address(0), "YieldMind: zero address");
        require(_admin != address(0), "YieldMind: zero admin");

        depositToken = IERC20(_depositToken);
        name = "YieldMind Vault";
        version = "1.0.0";
        harvestInterval = 1 hours;

        // Setup roles
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(STRATEGY_MANAGER_ROLE, _admin);
        _grantRole(HARVESTER_ROLE, _admin);
        _grantRole(GUARDIAN_ROLE, _admin);
    }

    // ==================== User Functions ====================

    /**
     * @notice Deposit tokens into the vault
     * @param amount Amount of tokens to deposit
     * @return shares Amount of vault shares received
     */
    function deposit(uint256 amount) external nonReentrant whenNotPaused returns (uint256 shares) {
        require(amount > 0, "YieldMind: zero amount");

        // Calculate shares
        shares = _calculateShares(amount);
        require(shares > 0, "YieldMind: zero shares");

        // Transfer tokens from user
        depositToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update state
        UserInfo storage user = userInfo[msg.sender];
        user.totalDeposited += amount;
        user.totalShares += shares;
        user.lastDepositTimestamp = block.timestamp;

        totalDeposits += amount;
        totalShares += shares;

        // On first deposit, also mint MINIMUM_SHARES dead shares to prevent inflation attack
        if (totalShares == shares) {
            // This was the first deposit; totalShares was 0 before adding `shares`
            // We need to add the dead shares
            totalShares += MINIMUM_SHARES;
        }

        emit Deposit(msg.sender, amount, shares);
    }

    /**
     * @notice Withdraw tokens from the vault
     * @param shares Amount of shares to redeem
     * @return amount Amount of tokens received
     */
    function withdraw(uint256 shares) external nonReentrant whenNotPaused returns (uint256 amount) {
        require(shares > 0, "YieldMind: zero shares");

        UserInfo storage user = userInfo[msg.sender];
        require(user.totalShares >= shares, "YieldMind: insufficient shares");

        // Calculate amount
        amount = _calculateAmount(shares);
        require(amount > 0, "YieldMind: zero amount");

        // Update state
        user.totalShares -= shares;
        user.totalDeposited -= amount;
        totalShares -= shares;
        totalDeposits -= amount;

        // Transfer tokens to user
        depositToken.safeTransfer(msg.sender, amount);

        emit Withdraw(msg.sender, amount, shares);
    }

    // ==================== Strategy Management ====================

    /**
     * @notice Add a new yield strategy
     * @param strategy Address of the strategy contract
     * @param _name Display name of the strategy
     * @param allocationBps Allocation in basis points (out of 10000)
     */
    function addStrategy(
        address strategy,
        string calldata _name,
        uint256 allocationBps
    ) external onlyStrategyManager {
        require(strategy != address(0), "YieldMind: zero address");
        require(!strategies[strategy].isActive, "YieldMind: strategy exists");
        require(allocationBps > 0 && allocationBps <= 10000, "YieldMind: invalid allocation");
        require(totalAllocatedBps + allocationBps <= 10000, "YieldMind: total allocation exceeded");

        strategies[strategy] = StrategyInfo({
            strategyAddress: strategy,
            name: _name,
            allocationBps: allocationBps,
            totalDeposited: 0,
            lastHarvestTimestamp: 0,
            isActive: true
        });

        strategyList.push(strategy);
        totalAllocatedBps += allocationBps;

        emit StrategyAdded(strategy, _name, allocationBps);
    }

    /**
     * @notice Remove a yield strategy
     * @param strategy Address of the strategy to remove
     */
    function removeStrategy(address strategy) external onlyStrategyManager nonReentrant {
        require(strategies[strategy].isActive, "YieldMind: strategy not active");

        // Withdraw all funds from strategy first
        uint256 balance = IYieldStrategy(strategy).balanceOf(address(this));
        if (balance > 0) {
            IYieldStrategy(strategy).withdraw(balance);
        }

        totalAllocatedBps -= strategies[strategy].allocationBps;
        strategies[strategy].isActive = false;

        // Remove from strategyList
        _removeFromList(strategy);

        emit StrategyRemoved(strategy);
    }

    /**
     * @notice Update strategy allocation
     * @param strategy Address of the strategy
     * @param newAllocationBps New allocation in basis points
     */
    function updateStrategyAllocation(
        address strategy,
        uint256 newAllocationBps
    ) external onlyStrategyManager {
        require(strategies[strategy].isActive, "YieldMind: strategy not active");
        require(newAllocationBps > 0 && newAllocationBps <= 10000, "YieldMind: invalid allocation");

        uint256 oldAllocation = strategies[strategy].allocationBps;
        uint256 newTotal = totalAllocatedBps - oldAllocation + newAllocationBps;
        require(newTotal <= 10000, "YieldMind: total allocation exceeded");

        strategies[strategy].allocationBps = newAllocationBps;
        totalAllocatedBps = newTotal;

        emit StrategyUpdated(strategy, oldAllocation, newAllocationBps);
    }

    // ==================== Harvest & Rebalance ====================

    /**
     * @notice Harvest rewards from a specific strategy
     * @param strategy Address of the strategy
     * @return rewardAmount Amount of rewards harvested
     */
    function harvest(address strategy) external onlyHarvester returns (uint256 rewardAmount) {
        require(strategies[strategy].isActive, "YieldMind: strategy not active");
        require(
            block.timestamp >= strategies[strategy].lastHarvestTimestamp + harvestInterval,
            "YieldMind: harvest too soon"
        );

        rewardAmount = IYieldStrategy(strategy).harvest();
        strategies[strategy].lastHarvestTimestamp = block.timestamp;

        totalRewardsDistributed += rewardAmount;

        emit Harvest(strategy, rewardAmount);
    }

    /**
     * @notice Rebalance the portfolio based on AI recommendations
     * @dev Withdraws funds from strategies with decreased allocation,
     *      then deposits into strategies with increased allocation.
     *      FIXED (C-02): Remove double-counting — do NOT modify totalDeposits during
     *      rebalance. The total user deposits don't change; only allocation shifts.
     *      Use a snapshot of totalDeposits for target calculations.
     * @param newAllocations Array of new allocations for each strategy
     */
    function rebalance(uint256[] calldata newAllocations) external onlyHarvester nonReentrant {
        require(newAllocations.length == strategyList.length, "YieldMind: length mismatch");

        uint256 totalNewAlloc = 0;
        for (uint256 i = 0; i < newAllocations.length; i++) {
            totalNewAlloc += newAllocations[i];
        }
        require(totalNewAlloc == 10000, "YieldMind: allocations must sum to 10000");

        // Snapshot totalDeposits BEFORE any changes — this is the true total
        uint256 totalDepositsSnapshot = totalDeposits;

        // Phase 1: Withdraw excess funds from strategies with decreased allocation
        // Track how much was withdrawn (tokens return to this contract)
        uint256 totalWithdrawn = 0;
        for (uint256 i = 0; i < strategyList.length; i++) {
            address strategy = strategyList[i];
            require(strategies[strategy].isActive, "YieldMind: strategy not active");

            uint256 oldAlloc = strategies[strategy].allocationBps;
            uint256 newAlloc = newAllocations[i];

            if (newAlloc < oldAlloc) {
                uint256 shares = IYieldStrategy(strategy).balanceOf(address(this));
                if (shares > 0) {
                    uint256 sharesToWithdraw = (shares * (oldAlloc - newAlloc)) / oldAlloc;
                    if (sharesToWithdraw > 0) {
                        uint256 withdrawnAmount = IYieldStrategy(strategy).withdraw(sharesToWithdraw);
                        strategies[strategy].totalDeposited -= withdrawnAmount;
                        totalWithdrawn += withdrawnAmount;
                        // Do NOT decrement totalDeposits — tokens are still in this contract
                    }
                }
            }
        }

        // Phase 2: Update allocations and deposit into strategies with increased allocation
        // Use totalDepositsSnapshot for target calculations (not the mutated totalDeposits)
        for (uint256 i = 0; i < strategyList.length; i++) {
            address strategy = strategyList[i];
            uint256 oldAlloc = strategies[strategy].allocationBps;
            uint256 newAlloc = newAllocations[i];

            strategies[strategy].allocationBps = newAlloc;

            if (newAlloc > oldAlloc && totalDepositsSnapshot > 0 && strategies[strategy].isActive) {
                uint256 targetAmount = (totalDepositsSnapshot * newAlloc) / 10000;
                uint256 currentAmount = strategies[strategy].totalDeposited;
                if (targetAmount > currentAmount) {
                    uint256 depositAmount = targetAmount - currentAmount;
                    uint256 available = depositToken.balanceOf(address(this));
                    if (depositAmount > available) {
                        depositAmount = available;
                    }
                    if (depositAmount > 0) {
                        IYieldStrategy(strategy).deposit(depositAmount);
                        strategies[strategy].totalDeposited += depositAmount;
                        // Do NOT increment totalDeposits — tokens just moved between strategies
                    }
                }
            }

            if (oldAlloc != newAlloc) {
                emit StrategyUpdated(strategy, oldAlloc, newAlloc);
            }
        }

        totalAllocatedBps = 10000;
        lastRebalanceTimestamp = block.timestamp;

        emit Rebalanced(block.timestamp);
    }

    // ==================== View Functions ====================

    /**
     * @notice Get the current APY for the entire vault
     * @return weightedAPY Weighted average APY across all strategies
     */
    function getVaultAPY() external view returns (uint256 weightedAPY) {
        uint256 totalWeight = 0;

        for (uint256 i = 0; i < strategyList.length; i++) {
            address strategy = strategyList[i];
            if (strategies[strategy].isActive) {
                uint256 apy = IYieldStrategy(strategy).getAPY();
                uint256 weight = strategies[strategy].allocationBps;
                weightedAPY += apy * weight;
                totalWeight += weight;
            }
        }

        if (totalWeight > 0) {
            weightedAPY = weightedAPY / totalWeight;
        }
    }

    /**
     * @notice Get all active strategies
     * @return activeStrategies Array of active strategy addresses
     */
    function getActiveStrategies() external view returns (address[] memory activeStrategies) {
        uint256 count = 0;
        for (uint256 i = 0; i < strategyList.length; i++) {
            if (strategies[strategyList[i]].isActive) {
                count++;
            }
        }

        activeStrategies = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < strategyList.length; i++) {
            if (strategies[strategyList[i]].isActive) {
                activeStrategies[idx++] = strategyList[i];
            }
        }
    }

    /**
     * @notice Get user's vault balance
     * @param user Address of the user
     * @return depositAmount Amount deposited
     * @return sharesAmount Amount of shares
     */
    function getUserBalance(address user) external view returns (uint256 depositAmount, uint256 sharesAmount) {
        UserInfo storage userInf = userInfo[user];
        depositAmount = userInf.totalDeposited;
        sharesAmount = userInf.totalShares;
    }

    /**
     * @notice Get the number of active strategies
     */
    function getStrategyCount() external view returns (uint256) {
        return strategyList.length;
    }

    /**
     * @notice Get strategy info
     * @param strategy Address of the strategy
     */
    function getStrategyInfo(address strategy) external view returns (
        string memory _name,
        uint256 allocationBps,
        uint256 totalDeposited,
        bool isActive,
        uint256 apy
    ) {
        StrategyInfo storage info = strategies[strategy];
        _name = info.name;
        allocationBps = info.allocationBps;
        totalDeposited = info.totalDeposited;
        isActive = info.isActive;
        apy = IYieldStrategy(strategy).getAPY();
    }

    // ==================== Emergency Functions ====================

    /**
     * @notice Pause the contract (emergency only)
     */
    function pause() external onlyGuardian {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyGuardian {
        _unpause();
    }

    /**
     * @notice Emergency withdraw all funds from a strategy
     * @param strategy Address of the strategy
     * FIXED (C-04): Use actual withdrawn amount for accounting instead of
     * stored totalDeposited (which may differ due to strategy losses/gains).
     * Added safe underflow protection with proper balance checks.
     */
    function emergencyWithdraw(address strategy) external onlyGuardian {
        require(strategies[strategy].isActive, "YieldMind: strategy not active");

        IYieldStrategy(strategy).pause();
        uint256 balance = IYieldStrategy(strategy).balanceOf(address(this));
        uint256 actualWithdrawn = 0;
        if (balance > 0) {
            actualWithdrawn = IYieldStrategy(strategy).withdraw(balance);
        }

        // Update state: use actual withdrawn amount, not stored totalDeposited
        // This prevents underflow if strategy suffered losses
        uint256 storedDeposited = strategies[strategy].totalDeposited;
        strategies[strategy].totalDeposited = 0;
        strategies[strategy].isActive = false;

        // Safe subtraction: only reduce totalDeposits by what was actually withdrawn
        if (actualWithdrawn > 0) {
            uint256 accountingDelta = storedDeposited < actualWithdrawn ? storedDeposited : actualWithdrawn;
            if (accountingDelta <= totalDeposits) {
                totalDeposits -= accountingDelta;
            } else {
                totalDeposits = 0;
            }
        }
        totalAllocatedBps -= strategies[strategy].allocationBps;
        _removeFromList(strategy);
    }

    // ==================== Internal Functions ====================

    /**
     * @notice Calculate shares for a deposit amount
     */
    function _calculateShares(uint256 amount) internal view returns (uint256) {
        require(amount > MINIMUM_SHARES, "Amount too small");
        if (totalShares == 0) {
            // First deposit: mint MINIMUM_SHARES as dead shares + user shares
            require(amount > MINIMUM_SHARES, "YieldMind: first deposit must exceed MINIMUM_SHARES");
            return amount - MINIMUM_SHARES;
        }
        return (amount * totalShares) / totalDeposits;
    }

    /**
     * @notice Calculate amount for shares
     */
    function _calculateAmount(uint256 shares) internal view returns (uint256) {
        if (totalShares == 0) {
            return 0;
        }
        return (shares * totalDeposits) / totalShares;
    }

    /**
     * @notice Remove an address from the strategy list
     */
    function _removeFromList(address strategy) internal {
        uint256 len = strategyList.length;
        for (uint256 i = 0; i < len; i++) {
            if (strategyList[i] == strategy) {
                strategyList[i] = strategyList[len - 1];
                strategyList.pop();
                break;
            }
        }
    }

    /**
     * @notice Update the harvest interval
     * @param newInterval New interval in seconds
     */
    function setHarvestInterval(uint256 newInterval) external onlyStrategyManager {
        require(newInterval >= 1 hours, "YieldMind: interval too short");
        harvestInterval = newInterval;
    }
}
