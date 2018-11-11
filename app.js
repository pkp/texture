/*
Custom functions and hooks to texture editor
 */


// adds  custom Event Lister to Save Button

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
	let sessions = app.state.archive._sessions;
	let manuscript = sessions.manuscript;
	let archive = new texture.TextureArchive();
	let document = archive._exportDocument('article', manuscript, sessions);


}

//  Wait for the app to load and add the event listner
setTimeout(saveButtonEventListner, 1000);

