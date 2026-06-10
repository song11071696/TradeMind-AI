// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IYieldStrategy
 * @notice Interface for yield strategies
 * @dev All yield strategies must implement this interface
 */
interface IYieldStrategy {
    /**
     * @notice Get the name of the strategy
     */
    function name() external view returns (string memory);

    /**
     * @notice Get the protocol this strategy uses
     */
    function protocol() external view returns (string memory);

    /**
     * @notice Get the current APY of the strategy
     * @return APY in basis points (e.g., 500 = 5%)
     */
    function getAPY() external view returns (uint256);

    /**
     * @notice Deposit tokens into the strategy
     * @param amount Amount to deposit
     * @return shares Amount of shares received
     */
    function deposit(uint256 amount) external returns (uint256 shares);

    /**
     * @notice Withdraw tokens from the strategy
     * @param shares Amount of shares to redeem
     * @return amount Amount of tokens received
     */
    function withdraw(uint256 shares) external returns (uint256 amount);

    /**
     * @notice Get the total value locked in the strategy
     */
    function totalValueLocked() external view returns (uint256);

    /**
     * @notice Get the balance of shares for a user
     * @param account User address
     * @return Balance of shares
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @notice Harvest rewards from the strategy
     * @return rewardAmount Amount of rewards harvested
     */
    function harvest() external returns (uint256 rewardAmount);

    /**
     * @notice Pause the strategy
     */
    function pause() external;

    /**
     * @notice Unpause the strategy
     */
    function unpause() external;

    /**
     * @notice Check if strategy is active
     */
    function isActive() external view returns (bool);
}
