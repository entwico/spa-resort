async function getToken() {
  let response = await fetch('/resort/oidc/access-token');

  if (response.ok) {
    const p = document.createElement('p');
    p.innerHTML = await response.text();
    p.classList.add('access-token');
    document.body.appendChild(p);
  }

  response = await fetch('/resort/oidc/userinfo');

  if (response.ok) {
    const p = document.createElement('p');
    p.innerText = JSON.stringify(await response.json(), null, 2);
    p.classList.add('userinfo');
    document.body.appendChild(p);
  }
}

getToken();

setInterval(() => getToken(), 10000);
