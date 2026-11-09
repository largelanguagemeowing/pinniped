#!/bin/bash

# Links /usr/bin/pinniped, which the desktop entry runs (desktops hide an entry whose command is
# missing). This runs as the RPM post-transaction script, after everything else in an upgrade,
# including the replaced package's post-remove script. Releases packaged before that script
# checked for an upgrade remove the link there, so making it any earlier would not last.
if type update-alternatives >/dev/null 2>&1; then
    # Remove previous link if it doesn't use update-alternatives
    if [ -L '/usr/bin/pinniped' -a -e '/usr/bin/pinniped' -a "`readlink '/usr/bin/pinniped'`" != '/etc/alternatives/pinniped' ]; then
        rm -f '/usr/bin/pinniped'
    fi
    update-alternatives --install '/usr/bin/pinniped' 'pinniped' '/opt/Pinniped/pinniped' 100 || ln -sf '/opt/Pinniped/pinniped' '/usr/bin/pinniped'
else
    ln -sf '/opt/Pinniped/pinniped' '/usr/bin/pinniped'
fi
