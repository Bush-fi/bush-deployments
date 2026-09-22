// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC4626, IERC20 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

/**
 * @notice A plain 1:1 ERC4626 wrapper over any ERC20, for fork tests that need a wrapped token (buffers, boosted
 * pool paths) on a chain that has none.
 */
contract MockERC4626 is ERC4626 {
    constructor(
        IERC20 asset_,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) ERC4626(asset_) {
        // solhint-disable-previous-line no-empty-blocks
    }
}
