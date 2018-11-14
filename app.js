/*
Custom functions and hooks to texture editor
 */



function saveButtonEventListner () {

	let saveButton = $('div.sm-save');

	if (saveButton !== undefined) {
		saveButton[0].addEventListener('click', function (event) {
			event.preventDefault();
			saveToPKPDocumnetStore();


		}, true);
	}
	else {
		console.error('Save Button was not loaded');
	}

}

// Save the updated Documet to PKP Document storage .e.g. OJS


function saveToPKPDocumnetStore () {

    let archive = app.state.archive;
    let buffer = archive.buffer;
    let config = null;
    let context = null;
    let resources = archive._upstreamArchive.resources;
    let sessions = archive._sessions;
    let storage = archive.storage;

    let textureArchive = new texture.TextureArchive(storage, buffer, context, config);
    textureArchive._sessions  = sessions;
    textureArchive._archiveId  = archive.archiveId;
    textureArchive._upstreamArchive  = archive._upstreamArchive;

    let doc = textureArchive._exportChanges(sessions, buffer);
    resources["manuscript.xml"]["data"] = doc.resources["manuscript.xml"].data;

   	let rawArchive = {
        version: buffer.getVersion(),
        diff: buffer.getChanges(),
        resources: resources
    };


	console.log("raw",rawArchive);

}

//  Wait for the app to load and add the event listner
setTimeout(saveButtonEventListner, 1000);

