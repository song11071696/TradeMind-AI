// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title YieldMindVault
 * @notice AI-powered yield optimization vault
 * @dev Manages deposits and automated yield strategies
 * FIXED (H-02): Replaced Ownable with AccessControl for role-based access control.
 * Added GUARDIAN_ROLE for emergency pause, separate from ADMIN_ROLE.
 * Added whenNotPaused to deposit/withdraw for emergency circuit breaker.
 */
contract YieldMindVault is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    // ==================== Roles ====================
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    IERC20 public immutable token;
    uint256 public totalDeposits;
    uint256 public totalYield;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public yieldEarned;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event YieldDistributed(address indexed user, uint256 amount);

    constructor(address _token, address _admin) {
        require(_token != address(0), "Invalid token");
        require(_admin != address(0), "Invalid admin");
        token = IERC20(_token);

        // Setup roles: admin gets DEFAULT_ADMIN_ROLE + GUARDIAN_ROLE
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(GUARDIAN_ROLE, _admin);
    }

    /**
     * @notice Deposit tokens into the vault
     * FIXED: Added whenNotPaused modifier for emergency circuit breaker
     */
    function deposit(uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount > 0, "Amount must be > 0");
        token.safeTransferFrom(msg.sender, address(this), _amount);
        balances[msg.sender] += _amount;
        totalDeposits += _amount;
        emit Deposited(msg.sender, _amount);
    }

    /**
     * @notice Withdraw tokens from the vault
     * FIXED: Added whenNotPaused modifier for emergency circuit breaker
     */
    function withdraw(uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount > 0, "Amount must be > 0");
        require(balances[msg.sender] >= _amount, "Insufficient balance");
        balances[msg.sender] -= _amount;
        totalDeposits -= _amount;
        token.safeTransfer(msg.sender, _amount);
        emit Withdrawn(msg.sender, _amount);
    }

    function getBalance(address _user) external view returns (uint256) {
        return balances[_user];
    }

    /**
     * @notice Pause the vault (emergency only)
     */
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the vault
     */
    function unpause() external onlyRole(GUARDIAN_ROLE) {
        _unpause();
    }

    /**
     * @notice Support interface detection for AccessControl
     */
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
