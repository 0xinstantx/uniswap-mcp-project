// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

contract SwapScript is Script {
    // Uniswap V3 SwapRouter address
    ISwapRouter public constant router = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    // USDC address on mainnet
    IERC20 public constant usdc = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);

    // WETH address on mainnet
    IWETH public constant weth = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    function run() external {
        // Private key of pre-funded account
        uint256 privateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

        // Setup
        vm.startBroadcast(privateKey);

        // Wrap 0.5 ETH to WETH
        weth.deposit{value: 0.5 ether}();
        weth.approve(address(router), 0.5 ether);

        // Swap parameters
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: address(weth),
            tokenOut: address(usdc),
            fee: 3000,
            recipient: address(this),
            deadline: block.timestamp + 1000,
            amountIn: 0.5 ether,
            amountOutMinimum: 0, // Set a reasonable minimum in prod
            sqrtPriceLimitX96: 0
        });

        // Execute swap
        uint256 amountOut = router.exactInputSingle(params);
        console.log("Received %s USDC", amountOut);

        vm.stopBroadcast();
        
        
    }
    
    
}

interface IWETH is IERC20 {
    function deposit() external payable;
}