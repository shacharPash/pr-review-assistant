# Third-party notices

The project source uses the [MIT license](LICENSE). Dependencies retain their own licenses.

Every production build generates `client/public/THIRD_PARTY_NOTICES.txt` from all installed packages, including development and build dependencies, and `package-lock.json`. This conservative set includes tools statically imported by the production server, such as Vite and open. Vite includes it in `dist/client/THIRD_PARTY_NOTICES.txt`, available at `/THIRD_PARTY_NOTICES.txt` in the running app. Preserve that file when distributing a build. It includes upstream notices bundled by Monaco, including notices for its editor font. Source installations also retain each dependency's original license files under `node_modules`.

The app uses system fonts and local assets. Reviewer avatars use initials. Third-party bot logo images have been removed from the distributable client. Product names identify integrations and do not imply endorsement. GitHub, Jira and Claude accounts and services remain subject to their providers' terms.

After changing dependencies, run `npm ci` and `npm run build` to regenerate the notices. Before distributing a packaged application, review any newly introduced asset or dependency whose licensing metadata is missing or unclear.
