// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IYieldStrategy.sol";

// Venus Protocol 接口
interface IVenusComptroller {
    function claimReward(uint32 holderIndex) external;
    function getRewardAddress() external view returns (address);
}

interface IVenusToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title YieldStrategy
 * @notice Base implementation of a yield strategy with Venus Protocol integration
 * @dev Uses AccessControl for role-based permissions
 */
contract YieldStrategy is IYieldStrategy, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ==================== Roles ====================
    bytes32 public constant HARVESTER_ROLE = keccak256("HARVESTER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    // ==================== State Variables ====================
    IERC20 public immutable underlying; // The underlying token
    string private _name;
    string private _protocol;
    uint256 public currentAPY; // in basis points (e.g., 500 = 5%)
    uint256 public totalDeposited;
    uint256 public totalShares;
    uint256 public constant MINIMUM_SHARES = 1000; // Dead shares to prevent first-deposit inflation attack
    mapping(address => uint256) public userShares;

    // Performance fee (in basis points)
    uint256 public performanceFee = 100; // 1%
    address public feeCollector;

    // ===== Venus协议集成 =====
    address public venusComptroller;
    address public rewardToken; // XVS

    // ==================== Events ====================
    event Deposited(address indexed user, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, uint256 shares, uint256 amount);
    event Harvested(uint256 rewardAmount);
    event APYUpdated(uint256 oldAPY, uint256 newAPY);
    event StrategyUpdated(address indexed newComptroller);

    // ==================== Constructor ====================
    constructor(
        string memory __name,
        string memory __protocol,
        uint256 _initialAPY,
        address _underlying,
        address _feeCollector,
        address _admin,
        address _venusComptroller,
        address _rewardToken
    ) {
        _name = __name;
        _protocol = __protocol;
        currentAPY = _initialAPY;
        underlying = IERC20(_underlying);
        feeCollector = _feeCollector;

        // 使用 AccessControl 替代 Ownable
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(HARVESTER_ROLE, _admin);
        _grantRole(GUARDIAN_ROLE, _admin);

        venusComptroller = _venusComptroller;
        rewardToken = _rewardToken;
    }

    // ==================== IYieldStrategy Implementation ====================

    function name() external view returns (string memory) {
        return _name;
    }

    function protocol() external view returns (string memory) {
        return _protocol;
    }

    function getAPY() external view returns (uint256) {
        return currentAPY;
    }

    function totalValueLocked() external view returns (uint256) {
        return totalDeposited;
    }

    function isActive() external view returns (bool) {
        return !paused();
    }

    /**
     * @notice Deposit tokens into the strategy
     */
    function deposit(uint256 amount) external nonReentrant whenNotPaused returns (uint256 shares) {
        require(amount > 0, "Strategy: zero amount");

        shares = _calculateShares(amount);
        require(shares > 0, "Strategy: zero shares");

        underlying.safeTransferFrom(msg.sender, address(this), amount);

        userShares[msg.sender] += shares;
        totalShares += shares;
        totalDeposited += amount;

        // On first deposit, also mint MINIMUM_SHARES dead shares to prevent inflation attack
        if (totalShares == shares) {
            totalShares += MINIMUM_SHARES;
        }

        emit Deposited(msg.sender, amount, shares);
    }

    /**
     * @notice Withdraw tokens from the strategy
     */
    function withdraw(uint256 shares) external nonReentrant whenNotPaused returns (uint256 amount) {
        require(shares > 0, "Strategy: zero shares");
        require(userShares[msg.sender] >= shares, "Strategy: insufficient shares");

        amount = _calculateAmount(shares);
        require(amount > 0, "Strategy: zero amount");

        userShares[msg.sender] -= shares;
        totalShares -= shares;
        totalDeposited -= amount;

        underlying.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, shares, amount);
    }

    /**
     * @notice 真实收益收割：从Venus协议领取XVS奖励
     * @dev 替代原有的模拟计算逻辑
     */
    function harvest() external nonReentrant whenNotPaused onlyRole(HARVESTER_ROLE) returns (uint256 rewardAmount) {
        uint256 balanceBefore = IERC20(rewardToken).balanceOf(address(this));

        // 从Venus协议领取真实奖励
        IVenusComptroller(venusComptroller).claimReward(0);

        uint256 balanceAfter = IERC20(rewardToken).balanceOf(address(this));
        rewardAmount = balanceAfter - balanceBefore;

        require(rewardAmount > 0, "No rewards to harvest");

        // Take performance fee
        uint256 fee = (rewardAmount * performanceFee) / 10000;
        uint256 netReward = rewardAmount - fee;

        if (fee > 0) {
            IERC20(rewardToken).safeTransfer(feeCollector, fee);
        }

        // 将净收益分配给用户（按份额比例）
        totalDeposited += netReward;

        emit Harvested(rewardAmount);
    }

    /**
     * @notice Get balance of shares for a user
     */
    function balanceOf(address account) external view returns (uint256) {
        return userShares[account];
    }

    // ==================== Admin Functions ====================

    /**
     * @notice Update the APY (would be called by oracle in production)
     */
    function updateAPY(uint256 newAPY) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newAPY <= 10000, "Strategy: APY too high"); // Max 100%
        uint256 oldAPY = currentAPY;
        currentAPY = newAPY;
        emit APYUpdated(oldAPY, newAPY);
    }

    /**
     * @notice Update the performance fee
     */
    function setPerformanceFee(uint256 newFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFee <= 1000, "Strategy: fee too high"); // Max 10%
        performanceFee = newFee;
    }

    /**
     * @notice Pause the strategy
     */
    function pause() external override onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the strategy
     */
    function unpause() external override onlyRole(GUARDIAN_ROLE) {
        _unpause();
    }

    /**
     * @dev 更新Venus Comptroller地址
     */
    function updateComptroller(address _newComptroller) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newComptroller != address(0), "Invalid address");
        venusComptroller = _newComptroller;
        emit StrategyUpdated(_newComptroller);
    }

    // ==================== Internal Functions ====================

    function _calculateShares(uint256 amount) internal view returns (uint256) {
        if (totalShares == 0) {
            return amount - MINIMUM_SHARES;
        }
        return (amount * totalShares) / totalDeposited;
    }

    function _calculateAmount(uint256 shares) internal view returns (uint256) {
        if (totalShares == 0) {
            return 0;
        }
        return (shares * totalDeposited) / totalShares;
    }
}
