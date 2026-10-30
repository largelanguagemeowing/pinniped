import React, { ReactNode } from 'react';
import { Box, Scroll, Text } from 'folds';
import { AuthFooter } from './AuthFooter';
import * as css from './styles.css';
import PinnipedSVG from '../../../../public/res/svg/pinniped.svg';

type AuthShellProps = {
  aside: ReactNode;
  children: ReactNode;
};

/** The two-column frame shared by sign-in and the verify-this-device step. */
export function AuthShell({ aside, children }: AuthShellProps) {
  return (
    <Scroll variant="Background" visibility="Hover" size="300" hideTrack>
      <Box className={css.AuthLayout}>
        <Box className={css.AuthMain} direction="Column">
          <Box className={css.AuthBrand} direction="Row">
            <img className={css.AuthLogo} src={PinnipedSVG} alt="" />
            <Text size="H4">Pinniped</Text>
          </Box>
          <Box className={css.AuthContent} direction="Column">
            {children}
          </Box>
          <AuthFooter />
        </Box>
        {aside}
      </Box>
    </Scroll>
  );
}
