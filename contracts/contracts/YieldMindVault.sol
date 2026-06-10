// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title YieldMindVault
 * @notice AI-powered yield optimization vault
 * @dev Manages deposits and automated yield strategies
 */
contract YieldMindVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    uint256 public totalDeposits;
    uint256 public totalYield;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public yieldEarned;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event YieldDistributed(address indexed user, uint256 amount);

    constructor(address _token, address _owner) Ownable(_owner) {
        require(_token != address(0), "Invalid token");
        token = IERC20(_token);
    }

    function deposit(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Amount must be > 0");
        token.safeTransferFrom(msg.sender, address(this), _amount);
        balances[msg.sender] += _amount;
        totalDeposits += _amount;
        emit Deposited(msg.sender, _amount);
    }

    function withdraw(uint256 _amount) external nonReentrant {
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
}
