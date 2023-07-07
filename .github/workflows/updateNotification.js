import fs from 'fs';

export default async function printStuff({github, context, githubWorkspaceRoot}) {
    console.log(github, context, "yo");
    const fullRepoName = context.payload.repository.full_name;
    console.log("repository full name: ", fullRepoName); // Eg: 'phcode-dev/phoenix-desktop'
    const owner = fullRepoName.split("/")[0], repo = fullRepoName.split("/")[1];
    console.log("repository owner, repo: ", owner, repo); // Eg: 'phcode-dev/phoenix-desktop'
    const releaseTag = context.payload.release.tag_name;
    console.log("Release Tag name: ", releaseTag);
    const isPreRelease = context.payload.release.prerelease;
    console.log("Release isPreRelease: ", isPreRelease);
    const releaseNotes = context.payload.release.body;
    console.log("Release Notes: ", releaseNotes);
    const releaseID = context.payload.release.id;
    const releaseAssets = (await github.rest.repos.listReleaseAssets({
        owner,
        repo,
        release_id: releaseID,
    })).data;
    console.log("Release assets: ", releaseAssets);

    // you can call additional github apis using await github.rest.* apis
    // See https://octokit.github.io/rest.js/v19#repos-get-release-by-tag for more availableapis

    // write to the docs folder here. all changes made here to the docs folder will be part of the pull request
    fs.writeFileSync(`${githubWorkspaceRoot}/docs/tauri/release.json`, JSON.stringify(releaseAssets, null, 2));
}